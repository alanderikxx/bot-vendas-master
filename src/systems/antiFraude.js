const config = require('../config');
const { db } = require('../database/database');
const { log } = require('../utils/logger');

const af = config.antiFraude;

/**
 * Verifica se o usuário está bloqueado por fraude
 */
function verificar(usuarioId) {
  const registro = db.prepare('SELECT * FROM tentativas_pagamento WHERE usuario_id = ?').get(usuarioId);
  if (!registro) return { bloqueado: false };

  if (registro.bloqueado) {
    return { bloqueado: true, mensagem: 'Sua conta foi sinalizada por atividade suspeita. Contate o suporte.' };
  }

  // Verificar cooldown entre compras
  const agora = Math.floor(Date.now() / 1000);
  const ultima = registro.ultimo;
  const cooldownSeg = af.cooldownCompra / 1000;

  if (agora - ultima < cooldownSeg && registro.tentativas >= af.maxTentativasPagamento) {
    const restante = Math.ceil(cooldownSeg - (agora - ultima));
    return { bloqueado: true, mensagem: `Muitas tentativas. Aguarde ${restante}s antes de tentar novamente.` };
  }

  return { bloqueado: false };
}

/**
 * Registra uma tentativa de pagamento
 */
function registrarTentativa(usuarioId) {
  const agora = Math.floor(Date.now() / 1000);
  const registro = db.prepare('SELECT * FROM tentativas_pagamento WHERE usuario_id = ?').get(usuarioId);

  if (!registro) {
    db.prepare('INSERT INTO tentativas_pagamento (usuario_id, tentativas, ultimo) VALUES (?,1,?)').run(usuarioId, agora);
    return;
  }

  const cooldownSeg = af.cooldownCompra / 1000;
  // Resetar se passou o cooldown
  if (agora - registro.ultimo > cooldownSeg) {
    db.prepare('UPDATE tentativas_pagamento SET tentativas=1, ultimo=? WHERE usuario_id=?').run(agora, usuarioId);
  } else {
    const novasTentativas = registro.tentativas + 1;
    db.prepare('UPDATE tentativas_pagamento SET tentativas=?, ultimo=? WHERE usuario_id=?').run(novasTentativas, agora, usuarioId);

    // Auto-bloquear após limite
    if (novasTentativas >= af.maxTentativasPagamento * 2) {
      bloquearPorFraude(usuarioId, 'Excesso de tentativas de pagamento (auto-detecção)');
    }
  }
}

/**
 * Bloquear usuário por fraude
 */
async function bloquearPorFraude(usuarioId, motivo) {
  db.prepare('UPDATE tentativas_pagamento SET bloqueado=1 WHERE usuario_id=?').run(usuarioId);
  db.prepare('UPDATE usuarios SET bloqueado=1, motivo_bloquio=? WHERE discord_id=?').run(motivo, usuarioId);

  await log('fraude', {
    usuario: usuarioId,
    descricao: `⚠️ Usuário bloqueado por fraude: ${motivo}`,
    motivo,
  });
}

/**
 * Verificar pedidos duplicados (mesmo produto no mesmo dia)
 */
function verificarPedidoDuplicado(usuarioId, produtoId) {
  const inicioDia = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const pedido = db.prepare(`
    SELECT COUNT(*) as c FROM pedidos
    WHERE usuario_id=? AND produto_id=? AND status IN ('pendente','pago','entregue') AND criado_em >= ?
  `).get(usuarioId, produtoId, inicioDia);
  return pedido.c > 0;
}

/**
 * Verificar limite de compras por dia
 */
function verificarLimitesDia(usuarioId) {
  const inicioDia = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const total = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE usuario_id=? AND criado_em >= ?`).get(usuarioId, inicioDia);
  if (total.c >= af.maxComprasDia) {
    return { ok: false, mensagem: `Limite de ${af.maxComprasDia} compras por dia atingido.` };
  }
  return { ok: true };
}

module.exports = { verificar, registrarTentativa, bloquearPorFraude, verificarPedidoDuplicado, verificarLimitesDia };

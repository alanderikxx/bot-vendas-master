/**
 * Sistema de Afiliados — 2 níveis
 *
 * Nível 1: o afiliado que forneceu o código no pedido
 * Nível 2: quem indicou o afiliado nível 1 (afiliado_de do afiliado_de)
 *
 * Split de cashback configurável:
 *   - 1 afiliado nível 2: nível1 = 75%, nível2 = 25%
 *   - 2 afiliados nível 2: nível1 = 50%, nível2a = 25%, nível2b = 25%
 *
 * O código do vendedor é vinculado por PEDIDO (não ao usuário permanentemente),
 * permitindo trocar o vendedor a cada compra.
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db, Usuarios, Config } = require('../database/database');
const config = require('../config');
const { log }  = require('../utils/logger');

const CANAL_AFILIADOS = '1546321296948731994';

// ─── Buscar afiliado pelo código ──────────────────────────────────────────────
function buscarPorCodigo(codigo) {
  return db.prepare('SELECT * FROM usuarios WHERE codigo_afil = ?').get(codigo.toUpperCase().trim()) || null;
}

// ─── Calcular e distribuir comissões de 2 níveis ──────────────────────────────
async function distribuirComissoes(pedido, afiliadoId) {
  if (!afiliadoId || !pedido.valor_total) return;

  const taxa1 = parseFloat(Config.get('taxa_afiliado') || '5');  // % do pedido pro nível 1
  const taxaCashback2 = parseFloat(Config.get('taxa_afil_nivel2') || '2'); // % do pedido pro nível 2

  const comissaoTotal1 = pedido.valor_total * taxa1 / 100;

  // Buscar afiliados nível 2 (quem o afiliado nível 1 indicou, e que têm compras)
  const afil1 = Usuarios.get(afiliadoId);
  if (!afil1) return;

  // Nível 2: todos os usuários que o afiliado nível 1 indicou E que já fizeram compras
  const nivel2 = db.prepare(`
    SELECT DISTINCT u.discord_id FROM usuarios u
    WHERE u.afiliado_de = ?
    AND EXISTS (SELECT 1 FROM pedidos p WHERE p.usuario_id = u.discord_id AND p.status IN ('pago','entregue'))
    LIMIT 2
  `).all(afiliadoId);

  let comissaoAfil1 = comissaoTotal1;
  const pagamentos = [{ id: afiliadoId, valor: 0 }];

  if (nivel2.length === 1) {
    // 1 afiliado nível 2: nível1 = 75%, nível2 = 25%
    const val2 = pedido.valor_total * taxaCashback2 / 100;
    comissaoAfil1 = pedido.valor_total * taxa1 * 0.75 / 100;
    pagamentos[0].valor = comissaoAfil1;
    pagamentos.push({ id: nivel2[0].discord_id, valor: val2 });
  } else if (nivel2.length >= 2) {
    // 2 afiliados nível 2: nível1 = 50%, cada nível2 = 25%
    const val2each = pedido.valor_total * taxaCashback2 / 100 / 2;
    comissaoAfil1 = pedido.valor_total * taxa1 * 0.50 / 100;
    pagamentos[0].valor = comissaoAfil1;
    pagamentos.push({ id: nivel2[0].discord_id, valor: val2each });
    pagamentos.push({ id: nivel2[1].discord_id, valor: val2each });
  } else {
    // Sem nível 2: afiliado 1 fica com 100% da comissão
    pagamentos[0].valor = comissaoTotal1;
  }

  // Creditar cada pagamento
  for (const pag of pagamentos) {
    if (!pag.id || pag.valor <= 0) continue;
    try {
      Usuarios.addSaldo(pag.id, pag.valor,
        `Comissão ${pag.id === afiliadoId ? 'Nível 1' : 'Nível 2'} — Pedido ${pedido.id.slice(0,8).toUpperCase()}`
      );
    } catch (e) {
      console.error('[Afiliados] Erro ao creditar:', e.message);
    }
  }

  // Atualizar afiliado_id e comissao_afil no pedido
  const totalComissoes = pagamentos.reduce((a, p) => a + p.valor, 0);
  db.prepare("UPDATE pedidos SET afiliado_id=?, comissao_afil=? WHERE id=?")
    .run(afiliadoId, totalComissoes, pedido.id);
}

// ─── Vincular código de vendedor AO PEDIDO (não ao usuário) ──────────────────
function vincularCodigoAoPedido(pedidoId, codigo, compradorId) {
  const afiliado = buscarPorCodigo(codigo);
  if (!afiliado)                          return { ok: false, erro: '❌ Código inválido.' };
  if (afiliado.discord_id === compradorId) return { ok: false, erro: '❌ Você não pode usar seu próprio código.' };

  // Apenas atualiza o afiliado_id do pedido — não muda afiliado_de do usuário
  db.prepare('UPDATE pedidos SET afiliado_id=? WHERE id=?').run(afiliado.discord_id, pedidoId);
  return { ok: true, afiliado };
}

// ─── Vincular afiliado permanentemente ao usuário (/afiliado usar) ────────────
function vincularAfiliado(usuarioId, codigoAfiliado) {
  const afiliado = buscarPorCodigo(codigoAfiliado);
  if (!afiliado)                          return { ok: false, erro: 'Código de afiliado inválido.' };
  if (afiliado.discord_id === usuarioId)  return { ok: false, erro: 'Você não pode usar seu próprio código.' };
  const usuario = Usuarios.get(usuarioId);
  if (!usuario)                           return { ok: false, erro: 'Usuário não encontrado.' };
  // Permite sobrescrever o afiliado anterior
  Usuarios.atualizar(usuarioId, { afiliado_de: afiliado.discord_id });
  return { ok: true, afiliado };
}

// ─── Painel do afiliado no canal fixo ────────────────────────────────────────
async function mostrarPainelAfiliado(interaction, codigo = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  // Validar código
  let usuario = null;
  if (codigo) {
    const afil = buscarPorCodigo(codigo);
    if (!afil) {
      return interaction.editReply({ content: '❌ Código inválido. Verifique e tente novamente.' });
    }
    // Verificar se é o próprio usuário
    if (afil.discord_id !== interaction.user.id) {
      // Admin pode ver qualquer painel; usuário comum só o próprio
      const { isAdmin } = require('../utils/permissions');
      if (!isAdmin(interaction.member)) {
        return interaction.editReply({ content: '❌ Este código não pertence a você.' });
      }
    }
    usuario = afil;
  } else {
    usuario = Usuarios.get(interaction.user.id);
    if (!usuario?.codigo_afil) {
      return interaction.editReply({ content: '❌ Você não tem código de afiliado cadastrado. Contate um administrador.' });
    }
  }

  const afilId = usuario.discord_id;

  // Stats de vendas
  const vendas = db.prepare(`
    SELECT COUNT(*) as total, COALESCE(SUM(valor_total),0) as receita,
           COALESCE(SUM(comissao_afil),0) as comissao
    FROM pedidos
    WHERE afiliado_id=? AND status IN ('pago','entregue')
  `).get(afilId);

  // Nível 2 — quem ele indicou e que já compraram
  const nivel2 = db.prepare(`
    SELECT u.discord_id, u.nome, u.codigo_afil,
      COUNT(p.id) as compras_geradas,
      COALESCE(SUM(p.valor_total),0) as receita_gerada
    FROM usuarios u
    LEFT JOIN pedidos p ON p.usuario_id=u.discord_id AND p.status IN ('pago','entregue')
    WHERE u.afiliado_de=?
    GROUP BY u.discord_id
  `).all(afilId);

  // Últimas 5 vendas
  const ultimasVendas = db.prepare(`
    SELECT p.id, p.valor_total, p.comissao_afil, p.metodo_pag, p.pago_em, pr.nome as produto
    FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id
    WHERE p.afiliado_id=? AND p.status IN ('pago','entregue')
    ORDER BY p.pago_em DESC LIMIT 5
  `).all(afilId);

  const minSaque = parseFloat(Config.get('min_saque_afiliado') || '20');
  const taxa1    = parseFloat(Config.get('taxa_afiliado') || '5');
  const taxa2    = parseFloat(Config.get('taxa_afil_nivel2') || '2');

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle(`🤝 Painel de Afiliado — ${usuario.nome || usuario.discord_id}`)
    .addFields(
      { name: '🔑 Seu Código',     value: `\`${usuario.codigo_afil}\``,                         inline: true },
      { name: '💰 Saldo a receber',value: `**R$ ${Number(usuario.saldo||0).toFixed(2)}**`,       inline: true },
      { name: '📊 Mín. Saque',     value: `R$ ${minSaque.toFixed(2)}`,                          inline: true },
      { name: '🛒 Vendas geradas', value: `**${vendas.total}** vendas`,                          inline: true },
      { name: '💵 Receita gerada', value: `R$ ${Number(vendas.receita).toFixed(2)}`,             inline: true },
      { name: '🏆 Total comissão', value: `**R$ ${Number(vendas.comissao).toFixed(2)}**`,        inline: true },
      { name: '⚙️ Sua % (Nível 1)',value: `**${taxa1}%** por venda`,                            inline: true },
      { name: '⚙️ % Nível 2',      value: `**${taxa2}%** dividido entre afiliados N2`,          inline: true },
      { name: '👥 Afiliados N2',   value: `**${nivel2.length}** cadastrado(s)`,                 inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Programa de Afiliados' });

  // Afiliados de nível 2
  if (nivel2.length > 0) {
    const n2txt = nivel2.map(u =>
      `• **${u.nome || u.discord_id}** (\`${u.codigo_afil || '—'}\`) — ${u.compras_geradas} compras | R$ ${Number(u.receita_gerada).toFixed(2)}`
    ).join('\n');
    embed.addFields({ name: '👥 Seus Afiliados (Nível 2)', value: n2txt, inline: false });
  }

  // Últimas vendas
  if (ultimasVendas.length > 0) {
    const vendasTxt = ultimasVendas.map(v => {
      const data  = v.pago_em ? new Date(v.pago_em*1000).toLocaleDateString('pt-BR') : '—';
      const metod = v.metodo_pag?.includes('pix') ? '💠' : v.metodo_pag?.includes('coins') ? '🪙' : '💳';
      return `${metod} **${v.produto.slice(0,25)}** — R$ ${Number(v.valor_total).toFixed(2)} | Comissão: R$ ${Number(v.comissao_afil||0).toFixed(2)} | ${data}`;
    }).join('\n');
    embed.addFields({ name: '🛒 Últimas Vendas', value: vendasTxt, inline: false });
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('afil_solicitar_saque')
        .setLabel('💸 Solicitar Saque')
        .setStyle(ButtonStyle.Success)
        .setDisabled(Number(usuario.saldo||0) < minSaque),
      new ButtonBuilder()
        .setCustomId('afil_ver_historico')
        .setLabel('📜 Histórico Completo')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.editReply({ embeds: [embed], components: rows });
}

// ─── Histórico completo de vendas do afiliado ─────────────────────────────────
async function mostrarHistoricoAfiliado(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const usuario = Usuarios.get(interaction.user.id);
  if (!usuario?.codigo_afil) return interaction.editReply({ content: '❌ Você não tem código de afiliado.' });

  const vendas = db.prepare(`
    SELECT p.id, p.valor_total, p.comissao_afil, p.metodo_pag, p.pago_em, pr.nome as produto,
           u.nome as comprador
    FROM pedidos p
    JOIN produtos pr ON p.produto_id=pr.id
    LEFT JOIN usuarios u ON p.usuario_id=u.discord_id
    WHERE p.afiliado_id=? AND p.status IN ('pago','entregue')
    ORDER BY p.pago_em DESC LIMIT 20
  `).all(interaction.user.id);

  if (!vendas.length) return interaction.editReply({ content: '📜 Nenhuma venda registrada ainda.' });

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('📜 Histórico de Vendas — Afiliado')
    .setDescription(vendas.map((v, i) => {
      const data  = v.pago_em ? new Date(v.pago_em*1000).toLocaleDateString('pt-BR') : '—';
      const metod = v.metodo_pag?.includes('pix') ? '💠' : v.metodo_pag?.includes('coins') ? '🪙' : '💳';
      return `\`${String(i+1).padStart(2,'0')}\` ${metod} **${v.produto.slice(0,22)}** — R$ ${Number(v.valor_total).toFixed(2)} → **+R$ ${Number(v.comissao_afil||0).toFixed(2)}** | ${v.comprador || '?'} | ${data}`;
    }).join('\n'))
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ─── Enviar embed fixo do painel de afiliados no canal ───────────────────────
async function enviarEmbedCanalAfiliados(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_AFILIADOS);
    if (!canal) return;

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🤝 Portal de Afiliados — Máximo Store')
      .setDescription([
        '> Bem-vindo ao sistema de afiliados!',
        '> Insira seu código exclusivo para acessar seu painel.',
        '',
        '**Como funciona:**',
        '> `1.` Você recebe um código exclusivo do administrador',
        '> `2.` Compartilhe seu código com seus clientes',
        '> `3.` A cada venda com seu código, você ganha comissão',
        '> `4.` Registre afiliados de nível 2 para ganhos extras',
        '',
        '> Clique em **🔑 Acessar Painel** para ver suas vendas e saldo.',
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Programa de Afiliados' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('afil_acessar_painel')
        .setLabel('🔑 Acessar Painel')
        .setStyle(ButtonStyle.Primary),
    );

    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    const existente = msgs?.find(m => m.author.id === guild.client.user.id && m.embeds[0]?.title?.includes('Portal de Afiliados'));

    if (existente) {
      await existente.edit({ embeds: [embed], components: [row] }).catch(() => {});
    } else {
      await canal.send({ embeds: [embed], components: [row] });
    }
  } catch (e) {
    console.error('[Afiliados] Erro ao enviar embed canal:', e.message);
  }
}

module.exports = {
  vincularAfiliado,
  vincularCodigoAoPedido,
  distribuirComissoes,
  buscarPorCodigo,
  mostrarPainelAfiliado,
  mostrarHistoricoAfiliado,
  enviarEmbedCanalAfiliados,
  CANAL_AFILIADOS,
};

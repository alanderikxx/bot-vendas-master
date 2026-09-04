const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const config  = require('../config');
const { Pedidos, Usuarios, Produtos, db } = require('../database/database');
const { log }           = require('../utils/logger');
const { Embeds, Rows }  = require('../utils/embeds');
const { entregarProduto } = require('../systems/loja');

const app = express();
app.use(express.json());

// ─── Servir assets estáticos (thumbnail, etc.) ────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, '../../assets')));

let _client = null;

// ─── Webhook PIX EFI Bank ─────────────────────────────────────────────────────
app.post('/webhook/pix', async (req, res) => {
  try {
    res.status(200).json({ ok: true });

    const { pix } = req.body;
    if (!pix || !Array.isArray(pix)) return;

    for (const pagamento of pix) {
      const { txid, valor, horario, e2eId } = pagamento;
      if (!txid) continue;

      // Buscar pedido pelo txid
      const pedido = Pedidos.getByTxId(txid);
      if (!pedido) {
        console.log(`[Webhook] TxID desconhecido: ${txid}`);
        continue;
      }
      if (pedido.status !== 'pendente') continue;

      console.log(`[Webhook] ✅ Pagamento PIX recebido! Pedido: ${pedido.id.slice(0,8)} | Valor: R$${valor}`);

      // Confirmar pagamento no banco
      db.prepare(`UPDATE pedidos SET status='pago', tx_id=?, pago_em=strftime('%s','now'), nota_fiscal=? WHERE id=?`)
        .run(e2eId || txid, JSON.stringify({ txid, e2eId, valor, horario }), pedido.id);

      // Atualizar estatísticas do usuário
      const usuario = Usuarios.get(pedido.usuario_id);
      if (usuario) {
        const novoGasto = (usuario.total_gasto || 0) + pedido.valor_total;
        const novasCompras = (usuario.total_compras || 0) + 1;
        const pontos = Math.floor(pedido.valor_total);
        Usuarios.atualizar(pedido.usuario_id, { total_gasto: novoGasto, total_compras: novasCompras });
        Usuarios.addPontos(pedido.usuario_id, pontos);

        // Processar comissão de afiliado
        if (pedido.afiliado_id && pedido.comissao_afil > 0) {
          Usuarios.addSaldo(pedido.afiliado_id, pedido.comissao_afil, `Comissão de venda - Pedido ${pedido.id.slice(0,8)}`);
          await log('afiliado', {
            usuario: pedido.afiliado_id,
            valor: pedido.comissao_afil,
            descricao: `Comissão de afiliado por venda de ${usuario.nome}`,
          });
        }
      }

      // Entregar via função central (caixa, coins ou produto)
      const { processarEntrega } = require('../systems/loja');
      await processarEntrega(Pedidos.getByTxId ? Pedidos.get(pedido.id) : pedido, _client);

      // Log
      const produto = Produtos.get(pedido.produto_id);
      await log('pagamento', {
        usuario: pedido.usuario_id,
        produto: produto?.nome || pedido.produto_id,
        valor: pedido.valor_total,
        pedidoId: pedido.id,
        descricao: `Pagamento PIX confirmado para ${produto?.nome}`,
      });
    }
  } catch (err) {
    console.error('[Webhook PIX]', err.message);
  }
});

// ─── Health check para Railway ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: 'Máximo Store',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
async function start(client) {
  _client = client;
  const port = process.env.PORT || config.webhook.port;
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`🌐 Servidor webhook rodando na porta ${port}`);
      resolve();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Porta ${port} já em uso — webhook PIX usando instância anterior.`);
      } else {
        console.error('[Webhook]', err.message);
      }
      resolve(); // não bloqueia o bot
    });
  });
}

module.exports = { app, start };

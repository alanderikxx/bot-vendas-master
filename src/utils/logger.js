/**
 * Logger — 3 webhooks separados por categoria:
 *  💰 VENDAS    → compra, pagamento, caixa_aberta, afiliado, estoque_baixo
 *  🎫 OPERAÇÕES → ticket_aberto, ticket_fechado, reembolso
 *  ⚙️ SISTEMA   → fraude, sistema, erro
 */

const { EmbedBuilder, WebhookClient } = require('discord.js');
const { db }  = require('../database/database');
const { v4: uuidv4 } = require('uuid');

let client = null;

// ─── Webhooks ─────────────────────────────────────────────────────────────────
const WEBHOOKS = {
  vendas:    'https://discord.com/api/webhooks/1544926092471570504/7GShc9c8kM5qEINCAlmOSVD7t2uHXw6mtMIbg09-6A-eSv59vXi-PmUANRHPudOtGheD',
  operacoes: 'https://discord.com/api/webhooks/1544109833689628774/6VDNPAl90ixO6X45eutAc8zbKn4jeMaV82AF94qDgtoG7VXwr4JeHtyEFIA6QXh27jD8',
  sistema:   'https://discord.com/api/webhooks/1544926332092424272/xzSHxux2NzogyLdOxv_do9QwVsfzBUI4_kMuHbiU1D3RoptrKiM7sGjwoJ6UuZ7tvjeS',
};

let hookVendas    = null;
let hookOperacoes = null;
let hookSistema   = null;

try { hookVendas    = new WebhookClient({ url: WEBHOOKS.vendas });    } catch {}
try { hookOperacoes = new WebhookClient({ url: WEBHOOKS.operacoes }); } catch {}
try { hookSistema   = new WebhookClient({ url: WEBHOOKS.sistema });   } catch {}

// ─── Mapeamento tipo → webhook + config ──────────────────────────────────────
const MAPA = {
  // 💰 Vendas
  compra:         { hook: () => hookVendas,    cor: 0x57F287, emoji: '🛒', nome: 'Máximo Store • Vendas'    },
  pagamento:      { hook: () => hookVendas,    cor: 0x2ECC71, emoji: '💰', nome: 'Máximo Store • Vendas'    },
  caixa_aberta:   { hook: () => hookVendas,    cor: 0xFFD700, emoji: '🎁', nome: 'Máximo Store • Vendas'    },
  afiliado:       { hook: () => hookVendas,    cor: 0x9B59B6, emoji: '🤝', nome: 'Máximo Store • Vendas'    },
  estoque_baixo:  { hook: () => hookVendas,    cor: 0xFEE75C, emoji: '📉', nome: 'Máximo Store • Vendas'    },

  // 🎫 Operações
  ticket_aberto:  { hook: () => hookOperacoes, cor: 0x5865F2, emoji: '🎫', nome: 'Máximo Store • Operações' },
  ticket_fechado: { hook: () => hookOperacoes, cor: 0x4F545C, emoji: '🔒', nome: 'Máximo Store • Operações' },
  reembolso:      { hook: () => hookOperacoes, cor: 0xE67E22, emoji: '↩️', nome: 'Máximo Store • Operações' },

  // ⚙️ Sistema & Segurança
  fraude:         { hook: () => hookSistema,   cor: 0xED4245, emoji: '🚨', nome: 'Máximo Store • Segurança' },
  sistema:        { hook: () => hookSistema,   cor: 0x5BC0DE, emoji: '⚙️', nome: 'Máximo Store • Sistema'  },
  erro:           { hook: () => hookSistema,   cor: 0xED4245, emoji: '❌', nome: 'Máximo Store • Sistema'  },
};

function setClient(c) { client = c; }

async function log(tipo, dados = {}) {
  try {
    // Salvar no banco sempre
    db.prepare(`INSERT INTO logs_acoes (id,tipo,executor_id,alvo_id,descricao,dados) VALUES (?,?,?,?,?,?)`)
      .run(
        uuidv4(), tipo,
        dados.executor || dados.executorId || null,
        dados.usuario  || dados.alvoId    || null,
        dados.descricao || '',
        JSON.stringify(dados),
      );

    // Enviar para o webhook correspondente
    const cfg = MAPA[tipo];
    if (!cfg) return;

    const hook = cfg.hook();
    if (!hook) return;

    const titulo = dados.titulo || tipo.replace(/_/g, ' ').toUpperCase();
    const desc   = dados.descricao || '';

    const embed = new EmbedBuilder()
      .setColor(cfg.cor)
      .setTitle(`${cfg.emoji} ${titulo}`)
      .setTimestamp();

    if (desc) embed.setDescription(desc);

    // Campos extras úteis
    const fields = [];
    if (dados.usuario)   fields.push({ name: '👤 Usuário',  value: `<@${dados.usuario}>`,                    inline: true });
    if (dados.executor)  fields.push({ name: '🔧 Executor', value: `<@${dados.executor}>`,                   inline: true });
    if (dados.valor)     fields.push({ name: '💵 Valor',    value: `R$ ${Number(dados.valor).toFixed(2)}`,   inline: true });
    if (dados.produto)   fields.push({ name: '📦 Produto',  value: String(dados.produto).slice(0, 100),      inline: true });
    if (dados.pedidoId)  fields.push({ name: '🆔 Pedido',   value: `\`${String(dados.pedidoId).slice(0,8).toUpperCase()}\``, inline: true });
    if (dados.ticketId)  fields.push({ name: '🎫 Ticket',   value: `\`${String(dados.ticketId)}\``,          inline: true });
    if (fields.length) embed.addFields(fields);

    await hook.send({ username: cfg.nome, embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('[Logger]', err.message);
  }
}

// Log no console com timestamp
const _log = console.log;
const _err = console.error;
console.log   = (...a) => _log('[LOG]', new Date().toLocaleTimeString('pt-BR'), ...a);
console.error = (...a) => _err('[ERR]', new Date().toLocaleTimeString('pt-BR'), ...a);

module.exports = { setClient, log };

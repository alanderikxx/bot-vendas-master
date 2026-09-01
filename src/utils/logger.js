/**
 * Logger — salva tudo no banco, mas no canal de logs APENAS transcripts de tickets
 * Webhook Discord recebe alertas críticos (fraude, erros)
 */

const { EmbedBuilder, WebhookClient } = require('discord.js');
const config = require('../config');
const { db }  = require('../database/database');
const { v4: uuidv4 } = require('uuid');

let client = null;

// Webhook para alertas críticos
let webhookClient = null;
if (process.env.DISCORD_WEBHOOK_LOGS) {
  try { webhookClient = new WebhookClient({ url: process.env.DISCORD_WEBHOOK_LOGS }); } catch {}
}

function setClient(c) { client = c; }

// Tipos que vão para o webhook (não para o canal)
const TIPOS_WEBHOOK = ['fraude', 'erro', 'sistema'];

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

    // Canal de logs: SOMENTE transcripts (tratados diretamente no tickets.js)
    // Webhook: só para tipos críticos
    if (webhookClient && TIPOS_WEBHOOK.includes(tipo)) {
      const cores = { fraude: 0xED4245, erro: 0xED4245, sistema: 0x5BC0DE };
      const emojis = { fraude: '⚠️', erro: '❌', sistema: '⚙️' };
      const embed = new EmbedBuilder()
        .setColor(cores[tipo] || 0x5865F2)
        .setTitle(`${emojis[tipo] || '📋'} ${dados.titulo || tipo.toUpperCase()}`)
        .setDescription(dados.descricao || '')
        .setTimestamp();
      await webhookClient.send({ username: 'Máximo Store — Alertas', embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('[Logger]', err.message);
  }
}

// Log no console com timestamp
const _log = console.log;
const _err = console.error;
console.log  = (...a) => _log('[LOG]', new Date().toLocaleTimeString('pt-BR'), ...a);
console.error = (...a) => _err('[ERR]', new Date().toLocaleTimeString('pt-BR'), ...a);

module.exports = { setClient, log };

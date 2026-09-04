/**
 * Helpers para DMs enviadas ao cliente
 * — Sugestão de produtos mais baratos
 * — Botão de transcript
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { db } = require('../database/database');
const config = require('../config');

function montarEmbedSugestao() {
  try {
    const produtos = db.prepare(`
      SELECT p.nome, MIN(vp.preco) as menor_preco
      FROM produtos p
      JOIN variantes_produto vp ON vp.produto_id = p.id AND vp.ativo = 1
      JOIN estoque_variante ev ON ev.variante_id = vp.id AND ev.usado = 0
      WHERE p.ativo = 1
      GROUP BY p.id
      ORDER BY menor_preco ASC
      LIMIT 3
    `).all();
    if (!produtos.length) return null;

    return new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🛍️ Confira outros produtos da loja!')
      .setDescription('> Aproveite e veja os produtos mais acessíveis da nossa loja:')
      .addFields(
        ...produtos.map(p => ({
          name:  `📦 ${p.nome}`,
          value: `> A partir de **R$ ${Number(p.menor_preco).toFixed(2)}**`,
          inline: true,
        }))
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Volte sempre!' });
  } catch { return null; }
}

async function buscarBotaoTranscript(ticketId) {
  if (!ticketId) return null;
  try {
    const row = db.prepare('SELECT id FROM transcripts WHERE ticket_id=? ORDER BY criado_em DESC LIMIT 1').get(ticketId);
    if (!row) return null;
    const baseUrl = process.env.BOT_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
      || process.env.WEBHOOK_URL?.replace('/webhook', '').replace(':3000', '').replace(':8080', '')
      || null;
    if (!baseUrl) return null;
    return new ButtonBuilder()
      .setLabel('📂 Abrir Transcript')
      .setStyle(ButtonStyle.Link)
      .setURL(`${baseUrl}/transcript/${row.id}`);
  } catch { return null; }
}

async function enviarDmFechamento(guild, ticket, motivo, fechadoPorId) {
  try {
    const member = await guild?.members.fetch(ticket.usuario_id).catch(() => null);
    if (!member) return;

    const embedDm = new EmbedBuilder()
      .setColor(0x2C2F33)
      .setTitle('🔒 Seu ticket foi encerrado')
      .setDescription('> Seu atendimento foi finalizado. Abaixo o resumo:')
      .addFields(
        { name: '🆔 Ticket',      value: `\`${ticket.id.slice(0,8).toUpperCase()}\``,              inline: true },
        { name: '✋ Atendente',   value: ticket.atendente ? `<@${ticket.atendente}>` : '—',        inline: true },
        { name: '🔒 Fechado por', value: `<@${fechadoPorId}>`,                                     inline: true },
        { name: '📝 Motivo',      value: motivo || '—',                                            inline: false },
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Obrigado pelo contato!' });

    const rowDm = new ActionRowBuilder();
    const transcriptBtn = await buscarBotaoTranscript(ticket.id);
    if (transcriptBtn) rowDm.addComponents(transcriptBtn);

    await member.send({
      embeds: [embedDm],
      components: rowDm.components.length ? [rowDm] : [],
    }).catch(() => {});

    // Sugestão de produtos
    const embedSugestao = montarEmbedSugestao();
    if (embedSugestao) await member.send({ embeds: [embedSugestao] }).catch(() => {});
  } catch (err) {
    console.error('[DM Fechamento]', err.message);
  }
}

async function enviarDmEntrega(member, pedidoId) {
  try {
    const transcriptBtn = await buscarBotaoTranscript(pedidoId);
    if (!transcriptBtn) return null;
    return new ButtonBuilder()
      .setLabel('📂 Ver Transcript')
      .setStyle(ButtonStyle.Link)
      .setURL(transcriptBtn.data.url);
  } catch { return null; }
}

module.exports = { montarEmbedSugestao, buscarBotaoTranscript, enviarDmFechamento, enviarDmEntrega };

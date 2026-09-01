const { Tickets, Usuarios, db } = require('../database/database');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Garantir perfil
    Usuarios.criar(message.author.id, message.author.username);

    // Contar msgs em tickets
    const ticket = Tickets.get(message.channelId);
    if (ticket) Tickets.atualizar(message.channelId, { mensagens: (ticket.mensagens || 0) + 1 });

    // ── Comando !coins (qualquer usuário) ──────────────────────────────────
    if (message.content.toLowerCase() === '!coins') {
      const usuario = Usuarios.garantir(message.author.id, message.author.username);
      const coins   = usuario.coins || 0;
      const emReais = (coins * 0.01).toFixed(2);

      const embed = new EmbedBuilder()
        .setColor(config.colors.coins || config.colors.gold)
        .setTitle('🪙 Seus Coins')
        .setDescription([
          `**${message.author.username}**, você tem:`,
          ``,
          `🪙 **${coins.toLocaleString('pt-BR')} coins**`,
          `💵 Equivale a **R$ ${emReais}**`,
          ``,
          `> 100 coins = R$ 1,00`,
          `> Use coins para pagar produtos!`,
        ].join('\n'))
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Use /coins comprar para adquirir mais' });

      await message.reply({ embeds: [embed] });
      return;
    }

    // ── Comando !saldo ─────────────────────────────────────────────────────
    if (message.content.toLowerCase() === '!saldo') {
      const usuario = Usuarios.garantir(message.author.id, message.author.username);
      await message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.gold)
          .setTitle('💰 Seu Saldo')
          .addFields(
            { name: '💵 Saldo R$', value: `R$ ${(usuario.saldo || 0).toFixed(2)}`, inline: true },
            { name: '🪙 Coins',    value: `${(usuario.coins || 0).toLocaleString('pt-BR')}`, inline: true },
            { name: '⭐ Pontos',   value: String(usuario.pontos || 0), inline: true },
          )
          .setTimestamp()
          .setFooter({ text: 'Máximo Store' })],
      });
      return;
    }
  },
};

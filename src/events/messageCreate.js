const { Tickets, Usuarios, db } = require('../database/database');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    // ── Comando !clear em DM (só Owner) ────────────────────────────────────
    if (!message.guild && message.content.toLowerCase().startsWith('!clear')) {
      const config  = require('../config');
      const ownerId = config.roles?.owner
        ? null  // owner é cargo, não ID — usa env
        : null;
      const OWNER_ID = process.env.OWNER_DISCORD_ID || '';

      if (OWNER_ID && message.author.id !== OWNER_ID) {
        await message.reply('❌ Apenas o Owner pode usar este comando.').catch(() => {});
        return;
      }

      const args   = message.content.split(' ');
      const limite = Math.min(parseInt(args[1]) || 100, 1000);

      const aviso = await message.channel.send(`🗑️ Deletando até **${limite}** mensagens do bot neste privado...`).catch(() => null);

      let deletadas = 0;
      let antes = undefined;

      while (deletadas < limite) {
        const buscar = Math.min(limite - deletadas, 100);
        const msgs = await message.channel.messages.fetch({ limit: buscar, ...(antes ? { before: antes } : {}) }).catch(() => null);
        if (!msgs || msgs.size === 0) break;

        const doBot = msgs.filter(m => m.author.id === message.client.user.id);
        for (const [, m] of doBot) {
          await m.delete().catch(() => {});
          deletadas++;
          await new Promise(r => setTimeout(r, 300)); // evitar rate limit
        }

        antes = msgs.last()?.id;
        if (msgs.size < buscar) break;
      }

      // Deletar o próprio aviso e o comando do usuário
      await aviso?.delete().catch(() => {});
      await message.delete().catch(() => {});

      const confirm = await message.channel.send(`✅ **${deletadas}** mensagem(ns) do bot deletada(s).`).catch(() => null);
      setTimeout(() => confirm?.delete().catch(() => {}), 5000);
      return;
    }

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

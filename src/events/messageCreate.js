const fs = require('fs');
const path = require('path');
const { Tickets, Usuarios, db } = require('../database/database');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const {
  add2FAAccount,
  remove2FAAccount,
  list2FAAccounts,
  generate2FACode,
  generate2FACodeFromSecret,
  generateAll2FACodes,
} = require('../2fa');

function getOwnerDiscordId() {
  return process.env.OWNER_DISCORD_ID || '';
}

function listarArquivosBanco() {
  const dbPath = path.resolve(process.cwd(), config.dbPath || path.join('data', 'database.db'));
  const candidatos = new Set();

  const baseCandidates = [
    dbPath,
    `${dbPath}.db`,
    `${dbPath}.sqlite`,
    `${dbPath}.sqlite3`,
    `${dbPath}-wal`,
    `${dbPath}-shm`,
  ];

  for (const item of baseCandidates) {
    if (item && fs.existsSync(item)) candidatos.add(item);
  }

  const fallbackAppData = '/app/data';
  if (fs.existsSync(fallbackAppData)) {
    for (const item of fs.readdirSync(fallbackAppData)) {
      if (/\.(db|sqlite|sqlite3)(-wal|-shm)?$/i.test(item)) {
        candidatos.add(path.join(fallbackAppData, item));
      }
    }
  }

  return [...candidatos];
}

async function enviarBackupBanco(message) {
  const ownerId = getOwnerDiscordId();
  if (!ownerId) {
    await message.reply('❌ Defina `OWNER_DISCORD_ID` no seu .env para liberar a exportação do banco.').catch(() => {});
    return;
  }

  if (message.author.id !== ownerId) {
    await message.reply('❌ Apenas o dono do bot pode exportar os dados do banco.').catch(() => {});
    return;
  }

  try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (error) {}

  const arquivos = listarArquivosBanco().filter((arquivo) => fs.existsSync(arquivo));
  if (!arquivos.length) {
    await message.reply('❌ Nenhum arquivo do banco foi encontrado em `./data` ou em `/app/data`.').catch(() => {});
    return;
  }

  try {
    await message.reply({
      content: '📦 Backup do volume do bot encontrado. Anexando os arquivos do banco.',
      files: arquivos.map((arquivo) => ({
        attachment: arquivo,
        name: path.basename(arquivo),
      })),
    });
  } catch (error) {
    await message.reply(`❌ Erro ao enviar o backup: ${error.message}`).catch(() => {});
  }
}

async function importarBackupBanco(message) {
  const ownerId = getOwnerDiscordId();
  if (!ownerId) {
    await message.reply('❌ Defina `OWNER_DISCORD_ID` no seu .env para liberar a importação do banco.').catch(() => {});
    return;
  }

  if (message.author.id !== ownerId) {
    await message.reply('❌ Apenas o dono do bot pode importar os dados do banco.').catch(() => {});
    return;
  }

  if (!message.attachments?.size) {
    await message.reply('📥 Anexe o arquivo do banco para importar. Ex.: `.db`, `.sqlite` ou `.sqlite3`.').catch(() => {});
    return;
  }

  try {
    const anexo = message.attachments.first();
    const destino = path.resolve(process.cwd(), config.dbPath || path.join('data', 'database.db'));
    fs.mkdirSync(path.dirname(destino), { recursive: true });

    const resposta = await fetch(anexo.url);
    if (!resposta.ok) throw new Error(`Falha ao baixar o arquivo (${resposta.status})`);

    const buffer = Buffer.from(await resposta.arrayBuffer());
    fs.writeFileSync(destino, buffer);

    await message.reply(`✅ Banco importado em: ${destino}\nReinicie o bot para carregar os dados novos.`).catch(() => {});
  } catch (error) {
    await message.reply(`❌ Erro ao importar o banco: ${error.message}`).catch(() => {});
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const texto = message.content.trim();
    const comando = texto.toLowerCase();

    if (comando === '!exportar') {
      await enviarBackupBanco(message);
      return;
    }

    if (comando === '!importar') {
      await importarBackupBanco(message);
      return;
    }

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

    // ── Comando !2fa ─────────────────────────────────────────────────────────
    if (message.content.toLowerCase().startsWith('!2fa')) {
      const args = message.content.trim().split(/\s+/);
      const sub = (args[1] || 'help').toLowerCase();

      try {
        if (sub === 'help' || sub === 'ajuda') {
          const ajuda = [
            '🔐 Comandos do 2FA:',
            '',
            '!2fa <secret>             → gera um código direto da chave',
            '!2fa add <nome> <secret>   → salva uma conta',
            '!2fa gerar <nome>          → gera o código atual',
            '!2fa listar                → lista contas salvas',
            '!2fa todos                 → gera todos os códigos',
            '!2fa remover <nome>        → remove uma conta',
            '',
            'Exemplo: !2fa I7YFCQEIZEOBNOZNM34JLZVJ6M',
          ].join('\n');
          await message.reply(ajuda);
          return;
        }

        if (!['add', 'listar', 'gerar', 'todos', 'remover'].includes(sub)) {
          const secret = args[1];
          if (!secret) {
            await message.reply('❌ Uso correto: `!2fa <secret>` ou `!2fa add <nome> <secret>`');
            return;
          }
          const codigo = generate2FACodeFromSecret(secret, 'Código 2FA');
          await message.reply(`🔐 Código gerado\n\n\`\`\`\n${codigo.token}\n\`\`\`\n\n⏳ Expira em: **${codigo.remaining}s**`);
          return;
        }

        if (sub === 'add') {
          const nome = args[2];
          const secret = args.slice(3).join(' ');
          if (!nome || !secret) {
            await message.reply('❌ Uso correto: `!2fa add <nome> <secret>`');
            return;
          }
          add2FAAccount(message.author.id, nome, secret);
          await message.reply(`✅ Conta **${nome}** salva com sucesso.`);
          return;
        }

        if (sub === 'listar') {
          const contas = list2FAAccounts(message.author.id);
          if (!contas.length) {
            await message.reply('📚 Você ainda não salvou nenhuma conta 2FA.');
            return;
          }
          await message.reply(`📚 Contas salvas:\n${contas.map(c => `• ${c}`).join('\n')}`);
          return;
        }

        if (sub === 'gerar') {
          const nome = args[2];
          if (!nome) {
            await message.reply('❌ Uso correto: `!2fa gerar <nome>`');
            return;
          }
          const codigo = generate2FACode(message.author.id, nome);
          await message.reply(`🔐 Código da conta **${codigo.label}**\n\n\`\`\`\n${codigo.token}\n\`\`\`\n\n⏳ Expira em: **${codigo.remaining}s**`);
          return;
        }

        if (sub === 'todos') {
          const contas = list2FAAccounts(message.author.id);
          if (!contas.length) {
            await message.reply('📋 Você ainda não salvou nenhuma conta 2FA.');
            return;
          }
          const codigos = generateAll2FACodes(message.author.id);
          const texto = codigos.map(c => `🔑 ${c.label}\n\`\`\`\n${c.token}\n\`\`\`\nExpira em: ${c.remaining}s`).join('\n\n');
          await message.reply(`📋 Códigos 2FA:\n\n${texto}`);
          return;
        }

        if (sub === 'remover') {
          const nome = args[2];
          if (!nome) {
            await message.reply('❌ Uso correto: `!2fa remover <nome>`');
            return;
          }
          remove2FAAccount(message.author.id, nome);
          await message.reply(`🗑️ Conta **${nome}** removida com sucesso.`);
          return;
        }

        await message.reply('❌ Comando inválido. Use `!2fa help`.');
      } catch (error) {
        await message.reply(`❌ ${error.message}`);
      }
      return;
    }

    // ── Comando !painel (forçar envio do painel fixo) ────────────────────────
    if (message.content.toLowerCase() === '!painel') {
      try {
        const { enviarPainelFixo, CANAL_PAINEL } = require('../systems/painelAdmin');
        await enviarPainelFixo(message.guild);
        await message.reply(`✅ Painel fixo enviado para o canal configurado (${CANAL_PAINEL}).`);
      } catch (error) {
        await message.reply(`❌ Não foi possível enviar o painel: ${error.message}`);
      }
      return;
    }

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

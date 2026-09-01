require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { init: initDb } = require('./database/database');
const { setClient, log } = require('./utils/logger');
const webhookServer = require('./webhook/server');

// ─── Cliente Discord ──────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,          // sistema de convites
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.GuildMember,
  ],
});

client.commands   = new Collection();
client.cooldowns  = new Collection();
client.pagamentos = new Map();
// Cache de convites para sistema de indicações
client.inviteCache = new Map(); // guildId -> Map(code -> uses)

// ─── Carregar comandos slash ──────────────────────────────────────────────────
function carregarComandos() {
  const pasta = path.join(__dirname, 'commands');
  const pastas = fs.readdirSync(pasta);
  let total = 0;
  for (const sub of pastas) {
    const subPath = path.join(pasta, sub);
    if (!fs.statSync(subPath).isDirectory()) continue;
    const arquivos = fs.readdirSync(subPath).filter(f => f.endsWith('.js'));
    for (const arquivo of arquivos) {
      const cmd = require(path.join(subPath, arquivo));
      if (cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
        total++;
      }
    }
  }
  console.log(`📂 ${total} comandos carregados.`);
}

// ─── Carregar eventos ─────────────────────────────────────────────────────────
function carregarEventos() {
  const pasta = path.join(__dirname, 'events');
  const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.js'));
  let total = 0;
  for (const arquivo of arquivos) {
    const evento = require(path.join(pasta, arquivo));
    if (evento.once) {
      client.once(evento.name, (...args) => evento.execute(...args, client));
    } else {
      client.on(evento.name, (...args) => evento.execute(...args, client));
    }
    total++;
  }
  console.log(`📡 ${total} eventos registrados.`);
}

// ─── Evento Ready ─────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   🚀 BOT MÁXIMO DE VENDAS INICIADO!      ║`);
  console.log(`║   🤖 ${client.user.tag.padEnd(38)}║`);
  console.log(`║   🌐 ${client.guilds.cache.size} servidor(es) conectado(s)       ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  setClient(client);

  // Cachear convites do servidor para o sistema de indicações
  try {
    const guild = client.guilds.cache.first();
    if (guild) {
      const invites = await guild.invites.fetch().catch(() => null);
      if (invites) {
        client.inviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
        console.log(`🔗 ${invites.size} convite(s) cacheado(s).`);
      }
    }
  } catch (e) { console.error('[Invites Cache]', e.message); }

  // Atividade rotativa
  const atividades = [
    { name: '🛍️ Máximo Store', type: ActivityType.Playing },
    { name: `💰 EFI Bank PIX`, type: ActivityType.Watching },
    { name: '🎁 Caixas Misteriosas', type: ActivityType.Playing },
    { name: `/loja para comprar`, type: ActivityType.Listening },
  ];
  let i = 0;
  client.user.setActivity(atividades[0].name, { type: atividades[0].type });
  setInterval(() => {
    i = (i + 1) % atividades.length;
    client.user.setActivity(atividades[i].name, { type: atividades[i].type });
  }, 30000);

  await log('sistema', { descricao: `Bot iniciado: ${client.user.tag}`, titulo: '🚀 Bot Online' });

  // Iniciar tarefas agendadas
  require('./tasks/scheduler')(client);

  // Enviar/atualizar painel admin fixo no canal configurado
  setTimeout(async () => {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;
      const { enviarPainelFixo }   = require('./systems/painelAdmin');
      const { enviarEmbedResgate } = require('./systems/codigosCoins');
      await enviarPainelFixo(guild);
      await enviarEmbedResgate(guild, '1544209839108915330');
      // Atualiza embeds das caixas ativas nos seus canais
      const { listarCaixasAtivas, enviarEmbedCaixasCanal } = require('./systems/caixaMisteriosa');
      const caixasAtivas = listarCaixasAtivas().filter(c => c.canal_id);
      const canaisVistos = new Set();
      for (const c of caixasAtivas) {
        if (!canaisVistos.has(c.canal_id)) {
          canaisVistos.add(c.canal_id);
          await enviarEmbedCaixasCanal(guild, c.canal_id).catch(() => {});
        }
      }
    } catch (e) { console.error('[Init]', e.message); }
  }, 3000);
});

// ─── Interaction handler ───────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      // Cooldown
      if (!client.cooldowns.has(cmd.data.name)) {
        client.cooldowns.set(cmd.data.name, new Collection());
      }
      const agora = Date.now();
      const temposCooldown = client.cooldowns.get(cmd.data.name);
      const cooldownAmount = (cmd.cooldown || 3) * 1000;
      if (temposCooldown.has(interaction.user.id)) {
        const expira = temposCooldown.get(interaction.user.id) + cooldownAmount;
        if (agora < expira) {
          const restante = ((expira - agora) / 1000).toFixed(1);
          return interaction.reply({ content: `⏳ Aguarde **${restante}s** antes de usar este comando novamente.`, ephemeral: true });
        }
      }
      temposCooldown.set(interaction.user.id, agora);
      setTimeout(() => temposCooldown.delete(interaction.user.id), cooldownAmount);

      await cmd.execute(interaction, client);
    }

    // Botões
    else if (interaction.isButton()) {
      const handlerPath = path.join(__dirname, 'handlers', 'buttons.js');
      if (fs.existsSync(handlerPath)) {
        await require(handlerPath)(interaction, client);
      }
    }

    // Menus select
    else if (interaction.isStringSelectMenu()) {
      const handlerPath = path.join(__dirname, 'handlers', 'selectMenus.js');
      if (fs.existsSync(handlerPath)) {
        await require(handlerPath)(interaction, client);
      }
    }

    // Modais
    else if (interaction.isModalSubmit()) {
      const handlerPath = path.join(__dirname, 'handlers', 'modals.js');
      if (fs.existsSync(handlerPath)) {
        await require(handlerPath)(interaction, client);
      }
    }

  } catch (err) {
    console.error('[Interaction]', err);
    await log('erro', { descricao: `Erro em interação: ${err.message}`, extra: err.stack?.slice(0, 500) });
    const payload = { content: '❌ Ocorreu um erro ao processar sua solicitação.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// ─── Inicialização ────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧 Inicializando banco de dados...');
  await initDb();

  console.log('📂 Carregando comandos e eventos...');
  carregarComandos();
  carregarEventos();

  console.log('🌐 Iniciando servidor webhook...');
  await webhookServer.start(client);

  console.log('🔑 Conectando ao Discord...');
  await client.login(config.token);
}

main().catch(err => {
  console.error('❌ Erro fatal na inicialização:', err);
  process.exit(1);
});

// Tratar erros não capturados
process.on('unhandledRejection', (err) => {
  console.error('[UnhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err);
});

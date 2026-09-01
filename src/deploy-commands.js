require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs   = require('fs');
const path = require('path');

const commands    = [];
const nomesSeen   = new Set();
const pasta       = path.join(__dirname, 'commands');

function carregarComandos(dir) {
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      carregarComandos(fullPath);
    } else if (item.endsWith('.js')) {
      const cmd = require(fullPath);
      if (!cmd.data) continue;
      const nome = cmd.data.name;
      if (nomesSeen.has(nome)) {
        console.warn(`⚠️  Duplicado ignorado: /${nome} (${fullPath})`);
        continue;
      }
      nomesSeen.add(nome);
      commands.push(cmd.data.toJSON());
      console.log(`✅ Carregado: /${nome}`);
    }
  }
}

carregarComandos(pasta);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n🚀 Registrando ${commands.length} comandos slash...\n`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log(`\n✅ ${commands.length} comandos registrados com sucesso!`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
})();

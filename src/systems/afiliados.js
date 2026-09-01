const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { db, Usuarios } = require('../database/database');
const { log } = require('../utils/logger');

/**
 * Registrar usuário como afiliado de alguém
 */
function vincularAfiliado(usuarioId, codigoAfiliado) {
  const afiliado = db.prepare('SELECT * FROM usuarios WHERE codigo_afil = ?').get(codigoAfiliado.toUpperCase());
  if (!afiliado) return { ok: false, erro: 'Código de afiliado inválido.' };
  if (afiliado.discord_id === usuarioId) return { ok: false, erro: 'Você não pode usar seu próprio código.' };

  const usuario = Usuarios.get(usuarioId);
  if (!usuario) return { ok: false, erro: 'Usuário não encontrado.' };
  if (usuario.afiliado_de) return { ok: false, erro: 'Você já está vinculado a um afiliado.' };

  Usuarios.atualizar(usuarioId, { afiliado_de: afiliado.discord_id });
  return { ok: true, afiliado };
}

/**
 * Painel do afiliado
 */
async function painelAfiliado(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);

  // Contar indicados
  const indicados = db.prepare('SELECT COUNT(*) as c FROM usuarios WHERE afiliado_de = ?').get(interaction.user.id)?.c || 0;

  // Vendas que geraram comissão
  const vendas = db.prepare(`
    SELECT COUNT(*) as c, SUM(comissao_afil) as total FROM pedidos
    WHERE afiliado_id = ? AND status IN ('pago','entregue')
  `).get(interaction.user.id);

  const minSaque = parseFloat(db.prepare("SELECT valor FROM configuracoes WHERE chave='min_saque_afiliado'").get()?.valor || '20');

  const embed = new EmbedBuilder()
    .setColor(config.colors.purple)
    .setTitle('🤝 Painel de Afiliados')
    .setDescription(`Compartilhe seu código e ganhe comissão em cada venda!`)
    .addFields(
      { name: '🔑 Seu Código', value: `\`${usuario.codigo_afil || 'Gerando...'}\``, inline: true },
      { name: '👥 Indicados', value: String(indicados), inline: true },
      { name: '🛒 Vendas', value: String(vendas.c || 0), inline: true },
      { name: '💰 Total Ganho', value: `R$ ${(vendas.total || 0).toFixed(2)}`, inline: true },
      { name: '🏦 Saldo Disponível', value: `R$ ${(usuario.saldo || 0).toFixed(2)}`, inline: true },
      { name: '📊 Mínimo para Saque', value: `R$ ${minSaque.toFixed(2)}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Programa de Afiliados' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('afiliado_sacar').setLabel('💸 Solicitar Saque').setStyle(ButtonStyle.Success).setDisabled((usuario.saldo || 0) < minSaque),
    new ButtonBuilder().setCustomId('afiliado_historico').setLabel('📜 Histórico').setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Solicitar saque de afiliado
 */
async function solicitarSaque(interaction) {
  const usuario = Usuarios.get(interaction.user.id);
  if (!usuario) return interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true });

  const minSaque = parseFloat(db.prepare("SELECT valor FROM configuracoes WHERE chave='min_saque_afiliado'").get()?.valor || '20');

  if ((usuario.saldo || 0) < minSaque) {
    return interaction.reply({ content: `❌ Saldo insuficiente. Mínimo: R$ ${minSaque.toFixed(2)}`, ephemeral: true });
  }

  // Criar ticket de saque
  const { abrirTicket } = require('./tickets');
  const { ok, canal } = await abrirTicket(interaction.guild, interaction.member, 'saque', {
    valor: usuario.saldo,
  });

  if (ok) {
    await log('afiliado', {
      usuario: interaction.user.id,
      valor: usuario.saldo,
      descricao: `Solicitação de saque: R$ ${usuario.saldo.toFixed(2)}`,
    });
    await interaction.reply({ content: `✅ Saque solicitado! Acesse ${canal} para continuar.`, ephemeral: true });
  } else {
    await interaction.reply({ content: '❌ Erro ao criar ticket de saque.', ephemeral: true });
  }
}

module.exports = { vincularAfiliado, painelAfiliado, solicitarSaque };

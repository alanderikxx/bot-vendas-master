/**
 * Sistema de submenu para criar/editar carrinhos
 * Padrão: estado em memória por usuário → botões → modais → publicar
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { db, Produtos } = require('../database/database');
const { v4: uuidv4 }   = require('uuid');
const config           = require('../config');

// ─── Estado em memória (por userId) ──────────────────────────────────────────
const sessoes = new Map(); // userId → { canalId, titulo, descricao, imagemUrl, cor, varianteId?, painelId?, modo }

function novaSessao(userId, modo = 'criar', dados = {}) {
  const s = {
    modo,           // 'criar' ou 'editar'
    canalId:   dados.canalId   || null,
    titulo:    dados.titulo    || null,
    descricao: dados.descricao || null,
    imagemUrl: dados.imagemUrl || null,
    cor:       dados.cor       || 'FF6B6B',
    painelId:  dados.painelId  || null, // para edição
    produtoId: dados.produtoId || null,
  };
  sessoes.set(userId, s);
  // TTL 30min
  const timer = setTimeout(() => sessoes.delete(userId), 30 * 60 * 1000);
  timer.unref?.();
  return s;
}

function getSessao(userId) { return sessoes.get(userId) || null; }
function setSessao(userId, patch) {
  const s = sessoes.get(userId);
  if (!s) return;
  Object.assign(s, patch);
}
function limparSessao(userId) { sessoes.delete(userId); }

// ─── Montar embed de status ───────────────────────────────────────────────────
function buildStatusEmbed(s) {
  const tick = v => v ? '✅' : '⬜';
  const modo = s.modo === 'editar' ? '✏️ Editar' : '➕ Criar';

  return new EmbedBuilder()
    .setColor(s.cor ? parseInt(s.cor, 16) || 0xFF6B6B : 0xFF6B6B)
    .setTitle(`🛒 ${modo} Carrinho`)
    .setDescription([
      `${tick(s.canalId)}  **Canal:** ${s.canalId ? `<#${s.canalId}>` : '*não definido*'}`,
      `${tick(s.titulo)}  **Nome do Produto:** ${s.titulo || '*não definido*'}`,
      `${tick(s.descricao)}  **Descrição:** ${s.descricao ? s.descricao.slice(0, 60) + (s.descricao.length > 60 ? '…' : '') : '*não definida*'}`,
      `${tick(s.imagemUrl)}  **Imagem:** ${s.imagemUrl ? '✅ URL configurada' : '*não definida*'}`,
      `${tick(s.cor)}  **Cor:** \`#${s.cor || 'FF6B6B'}\``,
      '',
      s.modo === 'criar'
        ? '> Preencha os campos acima e clique em **🚀 Publicar** para criar o carrinho no canal.'
        : '> Edite os campos desejados e clique em **💾 Salvar** para atualizar.',
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Preencha todos os campos obrigatórios (Canal e Nome)' });
}

// ─── Montar rows de botões ────────────────────────────────────────────────────
function buildRows(s) {
  const podePublicar = !!(s.canalId && s.titulo);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cc_canal').setLabel('📡 Canal').setStyle(s.canalId ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cc_titulo').setLabel('✏️ Nome e Cor').setStyle(s.titulo ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cc_descricao').setLabel('📝 Descrição').setStyle(s.descricao ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cc_imagem').setLabel('🖼️ Imagem').setStyle(s.imagemUrl ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(s.modo === 'editar' ? 'cc_salvar' : 'cc_publicar')
      .setLabel(s.modo === 'editar' ? '💾 Salvar Alterações' : '🚀 Publicar Carrinho')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!podePublicar),
    new ButtonBuilder().setCustomId('cc_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
  );

  return [row1, row2];
}

// ─── Abrir submenu ────────────────────────────────────────────────────────────
async function abrirSubmenu(interaction, modo = 'criar', dadosIniciais = {}) {
  const s = novaSessao(interaction.user.id, modo, dadosIniciais);
  const embed = buildStatusEmbed(s);
  const components = buildRows(s);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  }
}

// ─── Re-renderizar após mudança ───────────────────────────────────────────────
async function rerender(interaction) {
  const s = getSessao(interaction.user.id);
  if (!s) return interaction.reply({ content: '❌ Sessão expirada. Abra o menu novamente.', ephemeral: true });
  const embed = buildStatusEmbed(s);
  const components = buildRows(s);
  await interaction.update({ embeds: [embed], components }).catch(async () => {
    await interaction.editReply({ embeds: [embed], components }).catch(() => {});
  });
}

// ─── Modais ───────────────────────────────────────────────────────────────────
async function modalCanal(interaction) {
  const s = getSessao(interaction.user.id);
  const modal = new ModalBuilder().setCustomId('ccm_canal').setTitle('📡 Canal do Carrinho');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('canal_id')
        .setLabel('ID do Canal de destino')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(s?.canalId || '')
        .setPlaceholder('Ex: 1544177169440317440'),
    ),
  );
  return interaction.showModal(modal);
}

async function modalTitulo(interaction) {
  const s = getSessao(interaction.user.id);
  const modal = new ModalBuilder().setCustomId('ccm_titulo').setTitle('✏️ Nome e Cor');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('titulo')
        .setLabel('Nome do Produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(s?.titulo || '')
        .setPlaceholder('Ex: Netflix Premium'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('cor')
        .setLabel('Cor hex (ex: FF6B6B)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(s?.cor || 'FF6B6B')
        .setMaxLength(6)
        .setPlaceholder('FF6B6B'),
    ),
  );
  return interaction.showModal(modal);
}

async function modalDescricao(interaction) {
  const s = getSessao(interaction.user.id);
  const modal = new ModalBuilder().setCustomId('ccm_descricao').setTitle('📝 Descrição');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('descricao')
        .setLabel('Descrição do produto')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(s?.descricao || '')
        .setMaxLength(2000)
        .setPlaceholder('Descreva o produto, planos disponíveis, etc.'),
    ),
  );
  return interaction.showModal(modal);
}

async function modalImagem(interaction) {
  const s = getSessao(interaction.user.id);
  const modal = new ModalBuilder().setCustomId('ccm_imagem').setTitle('🖼️ Imagem');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('imagem')
        .setLabel('URL da imagem (ou GIF)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(s?.imagemUrl || '')
        .setPlaceholder('https://i.imgur.com/exemplo.gif'),
    ),
  );
  return interaction.showModal(modal);
}

// ─── Processadores de modais ──────────────────────────────────────────────────
async function processarCanal(interaction) {
  const canalId = interaction.fields.getTextInputValue('canal_id').trim();
  const canal   = interaction.guild.channels.cache.get(canalId);
  if (!canal) return interaction.reply({ content: `❌ Canal \`${canalId}\` não encontrado.`, ephemeral: true });
  setSessao(interaction.user.id, { canalId });
  return rerender(interaction);
}

async function processarTitulo(interaction) {
  const titulo = interaction.fields.getTextInputValue('titulo').trim();
  const cor    = interaction.fields.getTextInputValue('cor').trim().replace('#', '') || 'FF6B6B';
  setSessao(interaction.user.id, { titulo, cor: /^[0-9a-fA-F]{3,6}$/.test(cor) ? cor : 'FF6B6B' });
  return rerender(interaction);
}

async function processarDescricao(interaction) {
  const descricao = interaction.fields.getTextInputValue('descricao').trim();
  setSessao(interaction.user.id, { descricao: descricao || null });
  return rerender(interaction);
}

async function processarImagem(interaction) {
  const imagem = interaction.fields.getTextInputValue('imagem').trim();
  if (imagem) {
    try { new URL(imagem); } catch {
      return interaction.reply({ content: '❌ URL inválida.', ephemeral: true });
    }
  }
  setSessao(interaction.user.id, { imagemUrl: imagem || null });
  return rerender(interaction);
}

// ─── Publicar (criar novo carrinho) ──────────────────────────────────────────
async function publicar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = getSessao(interaction.user.id);
  if (!s?.canalId || !s?.titulo) return;

  const canal = interaction.guild.channels.cache.get(s.canalId);
  if (!canal) return interaction.followUp({ content: '❌ Canal não encontrado.', ephemeral: true });

  // Criar produto no banco
  const produtoId = uuidv4();
  db.prepare('INSERT INTO produtos (id, nome, descricao, preco, imagem_url, tipo, ativo, criado_por) VALUES (?,?,?,?,?,?,1,?)')
    .run(produtoId, s.titulo, s.descricao, 0, s.imagemUrl || null, 'digital', interaction.user.id);

  // Criar painel
  const painelId = uuidv4();
  db.prepare('INSERT INTO paineis_canal (id, canal_id, produto_id, titulo, descricao, cor, imagem_url, criado_por) VALUES (?,?,?,?,?,?,?,?)')
    .run(painelId, s.canalId, produtoId, s.titulo, s.descricao, s.cor, s.imagemUrl || null, interaction.user.id);

  // Enviar mensagem no canal
  const embedData = {
    color:       parseInt(s.cor, 16) || 0xFF6B6B,
    title:       `🛍️ ${s.titulo}`,
    description: s.descricao || 'Selecione um plano abaixo para comprar.',
    timestamp:   new Date().toISOString(),
    footer:      { text: 'Máximo Store • Selecione um plano para comprar' },
  };
  if (s.imagemUrl) embedData.image = { url: s.imagemUrl };

  const msg = await canal.send({ embeds: [embedData], components: [] });
  db.prepare('UPDATE paineis_canal SET mensagem_id=? WHERE id=?').run(msg.id, painelId);

  limparSessao(interaction.user.id);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Carrinho Publicado!')
      .setDescription([
        `📦 **${s.titulo}** publicado em <#${s.canalId}>`,
        '',
        `Para adicionar planos: **➕ Plano** no painel`,
        `Para adicionar estoque: **📥 Estoque** no painel`,
        `ID do produto: \`${produtoId.slice(0,8)}\``,
      ].join('\n'))
      .setTimestamp()],
    components: [],
  });
}

// ─── Salvar (editar carrinho existente) ──────────────────────────────────────
async function salvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = getSessao(interaction.user.id);
  if (!s?.painelId) return;

  // Atualizar painel e produto no banco
  db.prepare('UPDATE paineis_canal SET titulo=?, descricao=?, cor=?, imagem_url=? WHERE id=?')
    .run(s.titulo, s.descricao, s.cor, s.imagemUrl || null, s.painelId);
  db.prepare('UPDATE produtos SET nome=?, descricao=?, imagem_url=? WHERE id=?')
    .run(s.titulo, s.descricao, s.imagemUrl || null, s.produtoId);

  // Atualizar a mensagem do painel no canal
  try {
    const { atualizarPainelProduto } = require('./painelProduto');
    await atualizarPainelProduto(interaction.guild, s.painelId);
  } catch {}

  limparSessao(interaction.user.id);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Carrinho Atualizado!')
      .setDescription(`**${s.titulo}** foi atualizado com sucesso.`)
      .setTimestamp()],
    components: [],
  });
}

// ─── Cancelar ─────────────────────────────────────────────────────────────────
async function cancelar(interaction) {
  limparSessao(interaction.user.id);
  await interaction.update({
    embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setDescription('Operação cancelada.').setTimestamp()],
    components: [],
  });
}

module.exports = {
  abrirSubmenu,
  modalCanal, modalTitulo, modalDescricao, modalImagem,
  processarCanal, processarTitulo, processarDescricao, processarImagem,
  publicar, salvar, cancelar,
  getSessao,
};

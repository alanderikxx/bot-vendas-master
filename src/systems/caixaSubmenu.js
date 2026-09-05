/**
 * Submenu interativo de Caixa Misteriosa
 * Padrão: estado em memória → botões → modais → confirmar
 *
 * Fluxo:
 *  1. ➕ Criar → define nome, preço, canal, imagem, descrição
 *  2. 🎯 Add Item → seleciona a caixa e a variante + raridade + chance
 *  3. 📢 Publicar → escolhe canal
 *  4. 🔴/🟢 Ativar/Desativar → toggle
 *  5. 🗑️ Deletar → confirmação
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const { db }       = require('../database/database');
const { v4: uuidv4 } = require('uuid');
const config       = require('../config');

const RARIDADES = {
  comum:    { label: 'Comum',    emoji: '⚪', cor: 0x95A5A6 },
  raro:     { label: 'Raro',     emoji: '🔵', cor: 0x3498DB },
  epico:    { label: 'Épico',    emoji: '🟣', cor: 0x9B59B6 },
  lendario: { label: 'Lendário', emoji: '🌟', cor: 0xF1C40F },
};

// ─── Estado em memória ────────────────────────────────────────────────────────
const sessoes = new Map();

function nova(userId, tipo, dados = {}) {
  const s = { tipo, ...dados };
  sessoes.set(`cx_${tipo}_${userId}`, s);
  const t = setTimeout(() => sessoes.delete(`cx_${tipo}_${userId}`), 30 * 60 * 1000);
  t.unref?.();
  return s;
}
function get(userId, tipo) { return sessoes.get(`cx_${tipo}_${userId}`) || null; }
function set(userId, tipo, patch) { const s = get(userId, tipo); if (s) Object.assign(s, patch); }
function del(userId, tipo) { sessoes.delete(`cx_${tipo}_${userId}`); }

// ══════════════════════════════════════════════════════════════════════════════
// 1. CRIAR CAIXA
// ══════════════════════════════════════════════════════════════════════════════

function buildCriarEmbed(s) {
  const ok = v => v ? '🟢' : '🔴';
  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎁 Criar Caixa Misteriosa')
    .addFields(
      { name: `${ok(s.nome)} Nome`,       value: s.nome ? `\`${s.nome}\`` : '`não definido`',          inline: true },
      { name: `${ok(s.preco)} Preço`,     value: s.preco ? `R$ ${Number(s.preco).toFixed(2)}` : '`não definido`', inline: true },
      { name: `${ok(s.canalId)} Canal`,   value: s.canalId ? `<#${s.canalId}>` : '`não definido`',     inline: true },
      { name: `${ok(s.descricao)} Desc.`, value: s.descricao ? s.descricao.slice(0, 50) : '`opcional`', inline: true },
      { name: `${ok(s.imagemUrl)} Img`,   value: s.imagemUrl ? '`URL configurada ✅`' : '`opcional`',   inline: true },
    )
    .setDescription('> Preencha os campos e clique em **🚀 Criar** quando terminar.')
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Nome, Preço e Canal são obrigatórios' });
}

function buildCriarRows(s) {
  const pode = !!(s.nome && s.preco && s.canalId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxc_nome').setLabel('✏️ Nome e Preço').setStyle(s.nome ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxc_canal').setLabel('📡 Canal').setStyle(s.canalId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxc_desc').setLabel('📝 Descrição').setStyle(s.descricao ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxc_img').setLabel('🖼️ Imagem').setStyle(s.imagemUrl ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxc_salvar').setLabel('🚀 Criar Caixa').setStyle(ButtonStyle.Primary).setDisabled(!pode),
      new ButtonBuilder().setCustomId('cxc_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function abrirCriar(interaction) {
  nova(interaction.user.id, 'criar');
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'criar');
  await interaction.editReply({ embeds: [buildCriarEmbed(s)], components: buildCriarRows(s) });
}

async function rerenderCriar(interaction) {
  const s = get(interaction.user.id, 'criar');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildCriarEmbed(s)], components: buildCriarRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildCriarEmbed(s)], components: buildCriarRows(s) }));
}

async function criarModalNome(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_nome').setTitle('✏️ Nome e Preço');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome da caixa').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.nome || '').setPlaceholder('Ex: Caixa Premium')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('preco').setLabel('Preço (R$)').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.preco ? String(s.preco) : '').setPlaceholder('Ex: 5.00')),
  );
  return interaction.showModal(modal);
}

async function criarModalCanal(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_canal').setTitle('📡 Canal');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do Canal onde o embed vai aparecer').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.canalId || '').setPlaceholder('Ex: 1544832050924756993')),
  );
  return interaction.showModal(modal);
}

async function criarModalDesc(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_desc').setTitle('📝 Descrição');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(s?.descricao || '')),
  );
  return interaction.showModal(modal);
}

async function criarModalImg(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_img').setTitle('🖼️ Imagem');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imagem').setLabel('URL da imagem ou GIF').setStyle(TextInputStyle.Short).setRequired(false).setValue(s?.imagemUrl || '').setPlaceholder('https://...')),
  );
  return interaction.showModal(modal);
}

async function criarProcessarNome(interaction) {
  const nome  = interaction.fields.getTextInputValue('nome').trim();
  const preco = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',', '.'));
  if (isNaN(preco) || preco <= 0) return interaction.reply({ content: '❌ Preço inválido.', ephemeral: true });
  set(interaction.user.id, 'criar', { nome, preco });
  return rerenderCriar(interaction);
}

async function criarProcessarCanal(interaction) {
  const canalId = interaction.fields.getTextInputValue('canal_id').trim();
  const canal   = interaction.guild.channels.cache.get(canalId);
  if (!canal) return interaction.reply({ content: `❌ Canal \`${canalId}\` não encontrado.`, ephemeral: true });
  set(interaction.user.id, 'criar', { canalId });
  return rerenderCriar(interaction);
}

async function criarProcessarDesc(interaction) {
  const descricao = interaction.fields.getTextInputValue('descricao').trim();
  set(interaction.user.id, 'criar', { descricao: descricao || null });
  return rerenderCriar(interaction);
}

async function criarProcessarImg(interaction) {
  const imagem = interaction.fields.getTextInputValue('imagem').trim();
  if (imagem) { try { new URL(imagem); } catch { return interaction.reply({ content: '❌ URL inválida.', ephemeral: true }); } }
  set(interaction.user.id, 'criar', { imagemUrl: imagem || null });
  return rerenderCriar(interaction);
}

async function criarSalvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = get(interaction.user.id, 'criar');
  if (!s?.nome || !s?.preco || !s?.canalId) return;

  const id = uuidv4();
  db.prepare('INSERT INTO caixa_config (id,nome,descricao,preco,canal_id,imagem_url,ativa) VALUES (?,?,?,?,?,?,1)')
    .run(id, s.nome, s.descricao, s.preco, s.canalId, s.imagemUrl || null);

  del(interaction.user.id, 'criar');
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Caixa Criada!')
      .addFields(
        { name: '🎁 Nome',   value: s.nome,                                   inline: true },
        { name: '💵 Preço',  value: `R$ ${Number(s.preco).toFixed(2)}`,       inline: true },
        { name: '📡 Canal',  value: `<#${s.canalId}>`,                        inline: true },
        { name: '🆔 ID',     value: `\`${id.slice(0,8)}\``,                   inline: false },
      )
      .setDescription('> Use **🎯 Add Item** para adicionar prêmios à caixa.\n> Use **📢 Publicar** para enviar o embed no canal.')
      .setTimestamp()],
    components: [],
  });
}

async function criarCancelar(interaction) {
  del(interaction.user.id, 'criar');
  await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setTimestamp()], components: [] });
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. ADD ITEM
// ══════════════════════════════════════════════════════════════════════════════

function buildItemEmbed(s) {
  const ok = v => v ? '🟢' : '🔴';
  const rarInfo = s.raridade ? RARIDADES[s.raridade] : null;
  return new EmbedBuilder()
    .setColor(rarInfo?.cor || 0xFFD700)
    .setTitle('🎯 Adicionar Item à Caixa')
    .addFields(
      { name: `${ok(s.caixaId)} Caixa`,     value: s.caixaNome ? `\`${s.caixaNome}\`` : '`não selecionada`', inline: true },
      { name: `${ok(s.varianteId)} Produto`, value: s.varianteNome ? `\`${s.varianteNome}\`` : '`não selecionado`', inline: true },
      { name: `${ok(s.raridade)} Raridade`,  value: rarInfo ? `${rarInfo.emoji} ${rarInfo.label}` : '`não definida`', inline: true },
      { name: `${ok(s.chance)} Chance`,      value: s.chance ? `**${s.chance}%**` : '`não definida`', inline: true },
    )
    .setDescription('> Selecione a caixa e o produto, defina raridade e chance de drop.')
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Todos os campos são obrigatórios' });
}

function buildItemRows(s) {
  const pode = !!(s.caixaId && s.varianteId && s.raridade && s.chance);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxi_caixa').setLabel('🎁 Selecionar Caixa').setStyle(s.caixaId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxi_variante').setLabel('📦 Selecionar Produto').setStyle(s.varianteId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxi_dados').setLabel('⚙️ Raridade e Chance').setStyle(s.raridade ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxi_salvar').setLabel('✅ Adicionar Item').setStyle(ButtonStyle.Primary).setDisabled(!pode),
      new ButtonBuilder().setCustomId('cxi_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function abrirItem(interaction) {
  nova(interaction.user.id, 'item');
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'item');
  await interaction.editReply({ embeds: [buildItemEmbed(s)], components: buildItemRows(s) });
}

async function rerenderItem(interaction) {
  const s = get(interaction.user.id, 'item');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildItemEmbed(s)], components: buildItemRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildItemEmbed(s)], components: buildItemRows(s) }));
}

async function itemSelecionarCaixa(interaction) {
  const caixas = db.prepare('SELECT * FROM caixa_config WHERE ativa=1 ORDER BY nome').all();
  if (!caixas.length) return interaction.reply({ content: '❌ Nenhuma caixa ativa. Crie uma primeiro.', ephemeral: true });
  const options = caixas.slice(0, 25).map(c => ({
    label:       c.nome.slice(0, 100),
    description: `R$ ${Number(c.preco).toFixed(2)} • ID: ${c.id.slice(0,8)}`,
    value:       c.id,
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('cxs_caixa').setPlaceholder('Selecione a caixa').addOptions(options),
  );
  return interaction.reply({ content: '🎁 Selecione a caixa:', components: [row], ephemeral: true });
}

async function itemSelectCaixa(interaction) {
  const caixaId = interaction.values[0];
  const caixa   = db.prepare('SELECT * FROM caixa_config WHERE id=?').get(caixaId);
  set(interaction.user.id, 'item', { caixaId, caixaNome: caixa?.nome });
  await interaction.update({ content: `✅ Caixa **${caixa?.nome}** selecionada.`, components: [] }).catch(() => {});
  const s = get(interaction.user.id, 'item');
  if (s) await interaction.followUp({ embeds: [buildItemEmbed(s)], components: buildItemRows(s), ephemeral: true }).catch(() => {});
}

async function itemSelecionarVariante(interaction) {
  const variantes = db.prepare(`
    SELECT vp.id, vp.nome as v_nome, pr.nome as p_nome,
           (SELECT COUNT(*) FROM estoque_variante WHERE variante_id=vp.id AND usado=0) as estoque
    FROM variantes_produto vp JOIN produtos pr ON vp.produto_id=pr.id
    WHERE vp.ativo=1 ORDER BY pr.nome, vp.ordem LIMIT 25
  `).all();
  if (!variantes.length) return interaction.reply({ content: '❌ Nenhuma variante cadastrada.', ephemeral: true });
  const options = variantes.map(v => ({
    label:       `${v.p_nome} — ${v.v_nome}`.slice(0, 100),
    description: `${v.estoque} em estoque • ID: ${v.id.slice(0,8)}`,
    value:       v.id,
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('cxs_variante').setPlaceholder('Selecione o produto prêmio').addOptions(options),
  );
  return interaction.reply({ content: '📦 Selecione o produto que será o prêmio:', components: [row], ephemeral: true });
}

async function itemSelectVariante(interaction) {
  const varianteId = interaction.values[0];
  const variante   = db.prepare('SELECT vp.*, pr.nome as p_nome FROM variantes_produto vp JOIN produtos pr ON vp.produto_id=pr.id WHERE vp.id=?').get(varianteId);
  set(interaction.user.id, 'item', { varianteId, varianteNome: variante ? `${variante.p_nome} — ${variante.nome}` : varianteId.slice(0,8) });
  await interaction.update({ content: `✅ Produto **${variante?.nome}** selecionado.`, components: [] }).catch(() => {});
  const s = get(interaction.user.id, 'item');
  if (s) await interaction.followUp({ embeds: [buildItemEmbed(s)], components: buildItemRows(s), ephemeral: true }).catch(() => {});
}

async function itemModalDados(interaction) {
  const s = get(interaction.user.id, 'item');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada. Clique em **🎯 Add Item** novamente.', ephemeral: true });
  const modal = new ModalBuilder().setCustomId('cxm_item_dados').setTitle('⚙️ Raridade e Chance');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('raridade')
        .setLabel('Raridade: comum / raro / epico / lendario')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(s?.raridade || 'comum').setPlaceholder('comum'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('chance')
        .setLabel('Chance de drop (%) — soma deve ser 100')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(s?.chance ? String(s.chance) : '').setPlaceholder('Ex: 50'),
    ),
  );
  return interaction.showModal(modal);
}

async function itemProcessarDados(interaction) {
  const raridade  = interaction.fields.getTextInputValue('raridade').trim().toLowerCase();
  const chanceStr = interaction.fields.getTextInputValue('chance').trim();
  const chance    = parseFloat(chanceStr.replace(',', '.'));
  if (!RARIDADES[raridade]) return interaction.reply({ content: '❌ Raridade inválida. Use: `comum`, `raro`, `epico` ou `lendario`', ephemeral: true });
  if (isNaN(chance) || chance <= 0 || chance > 100) return interaction.reply({ content: '❌ Chance inválida. Use um número entre 1 e 100.', ephemeral: true });
  const s = get(interaction.user.id, 'item');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada. Clique em **🎯 Add Item** novamente.', ephemeral: true });
  set(interaction.user.id, 'item', { raridade, chance });
  // Modal não tem interaction.update — precisa usar deferUpdate + editReply
  await interaction.deferUpdate().catch(() => {});
  const sAtual = get(interaction.user.id, 'item');
  return interaction.editReply({ embeds: [buildItemEmbed(sAtual)], components: buildItemRows(sAtual) }).catch(() => {});
}

async function itemSalvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = get(interaction.user.id, 'item');
  if (!s?.caixaId || !s?.varianteId || !s?.raridade || !s?.chance) return;

  // Verificar se já existe esse item na caixa
  const existe = db.prepare('SELECT id FROM caixa_itens_config WHERE caixa_id=? AND variante_id=? AND ativa=1').get(s.caixaId, s.varianteId);
  if (existe) {
    db.prepare('UPDATE caixa_itens_config SET raridade=?, chance=? WHERE id=?').run(s.raridade, s.chance, existe.id);
  } else {
    db.prepare('INSERT INTO caixa_itens_config (id,caixa_id,variante_id,raridade,chance,ativa) VALUES (?,?,?,?,?,1)')
      .run(uuidv4(), s.caixaId, s.varianteId, s.raridade, s.chance);
  }

  // Calcular total de chances
  const totalChance = db.prepare('SELECT COALESCE(SUM(chance),0) as t FROM caixa_itens_config WHERE caixa_id=? AND ativa=1').get(s.caixaId).t;
  const aviso = totalChance > 100 ? `\n⚠️ Total de chances: **${totalChance}%** (acima de 100%)` : totalChance < 100 ? `\n⚠️ Total de chances: **${totalChance}%** (abaixo de 100%)` : '';

  del(interaction.user.id, 'item');
  const rarInfo = RARIDADES[s.raridade];
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(rarInfo.cor).setTitle('✅ Item Adicionado!')
      .addFields(
        { name: '🎁 Caixa',    value: s.caixaNome || '—',             inline: true },
        { name: '📦 Produto',  value: s.varianteNome || '—',           inline: true },
        { name: `${rarInfo.emoji} Raridade`, value: rarInfo.label,    inline: true },
        { name: '🎯 Chance',   value: `**${s.chance}%**`,              inline: true },
        { name: '📊 Total',    value: `**${totalChance}%**`,           inline: true },
      )
      .setDescription(`> Item configurado com sucesso.${aviso}`)
      .setTimestamp()],
    components: [],
  });
}

async function itemCancelar(interaction) {
  del(interaction.user.id, 'item');
  await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setTimestamp()], components: [] });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // Criar caixa
  abrirCriar,
  criarModalNome, criarModalCanal, criarModalDesc, criarModalImg,
  criarProcessarNome, criarProcessarCanal, criarProcessarDesc, criarProcessarImg,
  criarSalvar, criarCancelar,
  // Add item
  abrirItem,
  itemSelecionarCaixa, itemSelectCaixa,
  itemSelecionarVariante, itemSelectVariante,
  itemModalDados, itemProcessarDados,
  itemSalvar, itemCancelar,
};

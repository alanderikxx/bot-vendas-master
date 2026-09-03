/**
 * Painel Admin Central — canal fixo 1533638769901703178
 * Organizado em submenus com navegação por botões
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const { db, Config, Produtos, Usuarios } = require('../database/database');
const { isAdmin, isStaff, isLoja, isOwner } = require('../utils/permissions');
const config  = require('../config');
const moment  = require('moment-timezone');

const CANAL_PAINEL = '1533638769901703178';

// ─── Cache de stats (TTL 30s) ─────────────────────────────────────────────────
let _statsCache = null;
let _statsCacheTs = 0;

function getStats() {
  if (_statsCache && Date.now() - _statsCacheTs < 30000) return _statsCache;
  const hoje = Math.floor(new Date().setHours(0,0,0,0)/1000);
  _statsCache = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM pedidos WHERE status IN ('pago','entregue'))                           AS total_vendas,
      (SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE status IN ('pago','entregue'))        AS receita_total,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente')                                        AS pendentes,
      (SELECT COUNT(*) FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=?)             AS vendas_hoje,
      (SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=?) AS receita_hoje,
      (SELECT COUNT(*) FROM tickets WHERE status='aberto')                                          AS tickets,
      (SELECT COUNT(*) FROM reembolsos WHERE status='pendente')                                     AS reembolsos,
      (SELECT COUNT(*) FROM usuarios)                                                               AS usuarios,
      (SELECT COUNT(*) FROM produtos WHERE ativo=1)                                                AS produtos,
      (SELECT COUNT(*) FROM paineis_canal WHERE ativo=1)                                           AS paineis
  `).get(hoje, hoje);
  _statsCacheTs = Date.now();
  return _statsCache;
}

// ─── Embed e rows por submenu ─────────────────────────────────────────────────

async function buildHome(member) {
  const hoje      = Math.floor(new Date().setHours(0,0,0,0)/1000);
  const lojaAberta = Config.get('loja_aberta');
  const manutencao = Config.get('manutencao') === true;
  const nomeLoja   = Config.get('nome_loja') || 'Máximo Store';

  const s = getStats();

  const statusEmoji = manutencao ? '🔧' : '🟢';
  const statusTxt   = manutencao ? 'Manutenção' : 'Online';
  const ehAdmin     = member ? isAdmin(member) : true; // painel fixo sempre mostra tudo

  const embed = new EmbedBuilder()
    .setColor(manutencao ? config.colors.warning : config.colors.success)
    .setTitle(`🎛️ ${nomeLoja} — Painel de Controle`)
    .addFields(
      { name: '📊 Status',   value: `${statusEmoji} **${statusTxt}**\n\`${moment().tz(config.timezone).format('DD/MM HH:mm')}\``, inline: true },
      { name: '📅 Hoje',     value: `🛒 **${s.vendas_hoje}** vendas\n💵 **R$ ${Number(s.receita_hoje).toFixed(2)}**`,             inline: true },
      { name: '📈 Total',    value: `🛒 **${s.total_vendas}** vendas\n💵 **R$ ${Number(s.receita_total).toFixed(2)}**`,            inline: true },
      { name: '⚡ Urgente',  value: `⏳ ${s.pendentes} pendentes\n🎫 ${s.tickets} tickets\n↩️ ${s.reembolsos} reemb.`,            inline: true },
      { name: '📦 Produtos', value: `${s.produtos} produtos\n${s.paineis} painéis`,                                               inline: true },
      { name: '👥 Usuários', value: `${s.usuarios} cadastrados`,                                                                  inline: true },
    )
    .setFooter({ text: `Máximo Store • Painel Admin` })
    .setTimestamp();

  const rows = [];

  // Row 1 — Controles (sempre visível — permissão verificada no clique)
  rows.push(new ActionRowBuilder().addComponents(
    btn('pa_toggle_manut', manutencao ? '✅ Sair Manutenção' : '🔧 Manutenção', manutencao ? ButtonStyle.Success : ButtonStyle.Danger),
    btn('pa_atualizar',    '🔄 Atualizar', ButtonStyle.Primary),
    btn('pa_relatorio',    '📊 Relatório', ButtonStyle.Secondary),
  ));

  // Row 2 — Navegação
  rows.push(new ActionRowBuilder().addComponents(
    btn('pa_menu_loja',      '🛒 Loja',       ButtonStyle.Success),
    btn('pa_menu_operacoes', '⚙️ Operações',  ButtonStyle.Primary),
    btn('pa_menu_usuarios',  '👥 Usuários',   ButtonStyle.Secondary),
    btn('pa_menu_caixa',     '🎁 Caixas',     ButtonStyle.Secondary),
  ));

  return { embed, components: rows };
}

// ─── Menu Loja (cargo Loja+) ──────────────────────────────────────────────────
function buildLojaMenu() {
  const embed = new EmbedBuilder()
    .setColor(config.colors.loja)
    .setTitle('🛒 Painel — Loja')
    .setDescription([
      '> **Fluxo para criar um carrinho:**',
      '> `1.` **➕ Criar** — define nome, canal e imagem',
      '> `2.` **＋ Plano** — adiciona planos com preço',
      '> `3.` **📥 Estoque** — cola os itens (1 por linha)',
      '> ',
      '> **Cupons** podem ser criados e listados abaixo.',
    ].join('\n'))
    .setFooter({ text: 'Máximo Store • Loja' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_criar_carrinho',   '➕ Criar',         ButtonStyle.Success),
    btn('pa_listar_carrinhos', '📋 Ver',           ButtonStyle.Primary),
    btn('pa_editar_carrinho',  '✏️ Editar',        ButtonStyle.Primary),
    btn('pa_add_plano',        '＋ Plano',          ButtonStyle.Secondary),
    btn('pa_add_estoque',      '📥 Estoque',       ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_remover_plano',    '➖ Rem Plano',     ButtonStyle.Danger),
    btn('pa_editar_plano',     '✏️ Editar Plano',  ButtonStyle.Primary),
    btn('pa_criar_cupom',      '🎟️ Criar Cupom',   ButtonStyle.Success),
    btn('pa_listar_cupons',    '🎟️ Ver Cupons',    ButtonStyle.Secondary),
    btn('pa_deletar_carrinho', '🗑️ Deletar',       ButtonStyle.Danger),
  );  const row3 = new ActionRowBuilder().addComponents(
    btn('pa_home', '🔙 Voltar', ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2, row3] };
}

// ─── Menu Operações (Admin+) ──────────────────────────────────────────────────
function buildOperacoesMenu() {
  const s = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reembolsos WHERE status='pendente') AS reimb,
      (SELECT COUNT(*) FROM tickets WHERE status='aberto')      AS tick,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente')    AS pend
  `).get();

  const embed = new EmbedBuilder()
    .setColor(s.reimb > 0 || s.tick > 0 ? config.colors.warning : config.colors.success)
    .setTitle('⚙️ Painel — Operações')
    .setDescription('> Gerencie tickets, reembolsos, pedidos e campanhas.')
    .addFields(
      { name: '↩️ Reembolsos', value: `${s.reimb} pendente(s)`, inline: true },
      { name: '🎫 Tickets',    value: `${s.tick} aberto(s)`,    inline: true },
      { name: '⏳ Pedidos',    value: `${s.pend} pendente(s)`,  inline: true },
    )
    .setFooter({ text: 'Máximo Store • Operações' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_reembolsos',  `↩️ Reembolsos (${s.reimb})`, s.reimb > 0 ? ButtonStyle.Danger  : ButtonStyle.Secondary),
    btn('pa_tickets',     `🎫 Tickets (${s.tick})`,     s.tick > 0  ? ButtonStyle.Primary : ButtonStyle.Secondary),
    btn('pa_pendentes',   `⏳ Pendentes (${s.pend})`,   s.pend > 0  ? ButtonStyle.Primary : ButtonStyle.Secondary),
    btn('pa_relatorio',   '📊 Relatório',               ButtonStyle.Secondary),
    btn('pa_buscar_pedido', '🔍 Buscar Pedido',         ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_flashsale',              '⚡ Flash Sale',         ButtonStyle.Danger),
    btn('pa_fechar_todos_tickets',   '🔒 Fechar Tickets',     ButtonStyle.Danger),
    btn('pa_cancelar_pendentes',     '❌ Cancelar Pedidos',   ButtonStyle.Danger),
    btn('pa_anuncio',                '📣 Anúncio DM',         ButtonStyle.Primary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    btn('pa_home', '🔙 Voltar', ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2, row3] };
}

// ─── Menu Usuários (Admin+) ───────────────────────────────────────────────────
function buildUsuariosMenu() {
  const embed = new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle('👥 Painel — Usuários')
    .setDescription('> Busque, gerencie coins e visualize rankings.')
    .setFooter({ text: 'Máximo Store • Usuários' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_buscar_usuario',  '🔍 Buscar',         ButtonStyle.Primary),
    btn('pa_add_coins',       '🪙 Add Coins',       ButtonStyle.Success),
    btn('pa_remover_coins',   '🪙 Rem Coins',       ButtonStyle.Danger),
    btn('pa_gerar_codigos',   '🎫 Gerar Códigos',   ButtonStyle.Secondary),
    btn('pa_coins_todos',     '🎁 Coins p/ Todos',  ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_blacklist_cpf',  '🚫 Blacklist CPF',  ButtonStyle.Danger),
    btn('pa_ranking',        '🏆 Ranking',        ButtonStyle.Secondary),
    btn('pa_home',           '🔙 Voltar',         ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2] };
}

function buildCaixaMenu() {
  const { listarCaixasAtivas, getItensCaixa, RARIDADES } = require('./caixaMisteriosa');
  const caixas = listarCaixasAtivas();

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎁 Painel — Caixas Misteriosas')
    .setDescription(caixas.length
      ? caixas.map(c => {
          const itens = getItensCaixa(c.id);
          const linhas = itens.map(i => `  ${RARIDADES[i.raridade]?.emoji || '⚪'} ${i.variante_nome} — ${i.chance}%`);
          return [`**🎁 ${c.nome}** — R$ ${c.preco.toFixed(2)} | 🎰 ${c.total_abertas} abertas`, ...linhas].join('\n');
        }).join('\n\n')
      : '❌ Nenhuma caixa criada.\nClique em **➕ Criar** para começar.')
    .setFooter({ text: 'Máximo Store • Caixas' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_caixa_criar',     '➕ Criar',    ButtonStyle.Success),
    btn('pa_caixa_add_item',  '🎯 Add Item', ButtonStyle.Primary),
    btn('pa_caixa_rem_item',  '➖ Rem Item', ButtonStyle.Danger),
    btn('pa_caixa_deletar',   '🗑️ Deletar',  ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_caixa_publicar',  '📢 Publicar',       ButtonStyle.Success),
    btn('pa_caixa_historico', '📊 Histórico',      ButtonStyle.Secondary),
    btn('pa_caixa_toggle',    '🔴/🟢 Ativar',      ButtonStyle.Secondary),
    btn('pa_home',            '🔙 Voltar',         ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2] };
}

// ─── Enviar/Atualizar painel ──────────────────────────────────────────────────

async function enviarPainelFixo(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_PAINEL);
    if (!canal) return console.error('[PainelAdmin] Canal não encontrado:', CANAL_PAINEL);

    const { embed, components } = await buildHome(null);

    // Buscar mensagem existente
    const msgs = await canal.messages.fetch({ limit: 15 }).catch(() => null);
    const msgExistente = msgs?.find(m => m.author.id === guild.client.user.id && m.embeds.length > 0);

    if (msgExistente) {
      await msgExistente.edit({ embeds: [embed], components }).catch(() => {});
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('painel_admin_msg_id',?,'string')").run(msgExistente.id);
      return;
    }

    const msg = await canal.send({ embeds: [embed], components });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('painel_admin_msg_id',?,'string')").run(msg.id);
  } catch (err) {
    console.error('[PainelAdmin]', err.message);
  }
}

async function atualizarPainelAdmin(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_PAINEL);
    if (!canal) return;
    const msgId = Config.get('painel_admin_msg_id');
    if (!msgId) return enviarPainelFixo(guild);
    const msg = await canal.messages.fetch(msgId).catch(() => null);
    if (!msg) return enviarPainelFixo(guild);
    const { embed, components } = await buildHome(null);
    await msg.edit({ embeds: [embed], components });
  } catch (err) {
    console.error('[PainelAdmin] Atualizar:', err.message);
  }
}

// ─── Handler central dos botões pa_* ─────────────────────────────────────────
async function handlePainelAdmin(interaction, client) {
  const id = interaction.customId;

  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  }

  // ── Navegação de submenus ─────────────────────────────────────────────────
  if (id === 'pa_home') {
    const { embed, components } = await buildHome(interaction.member);
    return interaction.update({ embeds: [embed], components }).catch(() =>
      interaction.editReply({ embeds: [embed], components }));
  }
  if (id === 'pa_menu_loja') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja+.', ephemeral: true });
    const { embed, components } = buildLojaMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_operacoes') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildOperacoesMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_usuarios') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildUsuariosMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_caixa') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildCaixaMenu();
    return interaction.update({ embeds: [embed], components });
  }
  // Aliases antigos para não quebrar nada
  if (id === 'pa_menu_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja+.', ephemeral: true });
    const { embed, components } = buildLojaMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_gestao') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildOperacoesMenu();
    return interaction.update({ embeds: [embed], components });
  }

  // ── Atualizar home ────────────────────────────────────────────────────────
  if (id === 'pa_atualizar') {
    await interaction.deferReply({ ephemeral: true });
    await atualizarPainelAdmin(interaction.guild);
    return interaction.editReply({ content: '✅ Painel atualizado!' });
  }

  // ── Toggle loja ───────────────────────────────────────────────────────────
  if (id === 'pa_toggle_loja') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const atual = Config.get('loja_aberta');
    Config.set('loja_aberta', atual ? '0' : '1');
    const { log } = require('../utils/logger');
    await log('sistema', { executor: interaction.user.id, descricao: `Loja ${atual ? 'fechada' : 'aberta'}` });
    await interaction.reply({ content: `✅ Loja ${atual ? '🔴 fechada' : '🟢 aberta'}.`, ephemeral: true });
    return atualizarPainelAdmin(interaction.guild);
  }

  // ── Toggle manutenção ─────────────────────────────────────────────────────
  if (id === 'pa_toggle_manut') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const atual = Config.get('manutencao') === true || Config.get('manutencao') === '1';
    // Salvar como boolean explícito para Config.get retornar corretamente
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('manutencao',?,'boolean')").run(atual ? '0' : '1');
    _statsCache = null; // invalidar cache
    await interaction.reply({ content: `✅ Manutenção ${atual ? 'desativada ✅' : 'ativada 🔧'}.`, ephemeral: true });
    return atualizarPainelAdmin(interaction.guild);
  }

  // ── Relatório ─────────────────────────────────────────────────────────────
  if (id === 'pa_relatorio') {
    await interaction.deferReply({ ephemeral: true });
    const periodos = [
      { nome: 'Hoje',    inicio: Math.floor(new Date().setHours(0,0,0,0)/1000) },
      { nome: '7 dias',  inicio: Math.floor(Date.now()/1000) - 7*86400 },
      { nome: '30 dias', inicio: Math.floor(Date.now()/1000) - 30*86400 },
      { nome: 'Total',   inicio: 0 },
    ];
    const embed = new EmbedBuilder().setColor(config.colors.info).setTitle('📊 Relatório de Vendas').setTimestamp();
    for (const p of periodos) {
      const r = db.prepare("SELECT COUNT(*) as v, COALESCE(SUM(valor_total),0) as r FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=?").get(p.inicio);
      embed.addFields({ name: `📅 ${p.nome}`, value: `${r.v} vendas • R$ ${Number(r.r).toFixed(2)}`, inline: true });
    }
    // Botão para exportar CSV e gráfico
    const { AttachmentBuilder } = require('discord.js');
    const rowCsv = new ActionRowBuilder().addComponents(
      btn('pa_exportar_csv',      '📥 Exportar CSV',    ButtonStyle.Secondary),
      btn('pa_grafico_vendas',    '📈 Gráfico Vendas',  ButtonStyle.Primary),
    );
    return interaction.editReply({ embeds: [embed], components: [rowCsv] });
  }

  if (id === 'pa_grafico_vendas') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    // Últimos 7 dias
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const inicio = Math.floor(new Date(Date.now() - i * 86400000).setHours(0,0,0,0) / 1000);
      const fim    = inicio + 86400;
      const r = db.prepare("SELECT COUNT(*) as v, COALESCE(SUM(valor_total),0) as r FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=? AND pago_em<?").get(inicio, fim);
      const data = new Date(inicio * 1000);
      dias.push({ label: `${data.getDate().toString().padStart(2,'0')}/${(data.getMonth()+1).toString().padStart(2,'0')}`, vendas: r.v, receita: Number(r.r) });
    }

    // Tentar gerar gráfico com canvas (disponível no Railway)
    try {
      const { createCanvas } = require('canvas');
      const W = 700, H = 350, PAD = 50;
      const canvas = createCanvas(W, H);
      const ctx    = canvas.getContext('2d');

      // Fundo
      ctx.fillStyle = '#2C2F33';
      ctx.fillRect(0, 0, W, H);

      // Título
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('📈 Vendas — Últimos 7 Dias', PAD, 30);

      const maxVendas = Math.max(...dias.map(d => d.vendas), 1);
      const barW = (W - PAD * 2) / dias.length - 10;
      const chartH = H - PAD * 2;

      dias.forEach((d, i) => {
        const x     = PAD + i * ((W - PAD * 2) / dias.length) + 5;
        const barH  = (d.vendas / maxVendas) * chartH;
        const y     = H - PAD - barH;
        const hue   = 140; // verde
        ctx.fillStyle = `hsl(${hue}, 60%, ${40 + (d.vendas / maxVendas) * 30}%)`;
        ctx.fillRect(x, y, barW, barH);
        // Label data
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '12px sans-serif';
        ctx.fillText(d.label, x, H - PAD + 15);
        // Valor
        if (d.vendas > 0) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(String(d.vendas), x + barW/2 - 5, y - 5);
        }
      });

      // Eixo
      ctx.strokeStyle = '#555';
      ctx.beginPath();
      ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD);
      ctx.stroke();

      const buf = canvas.toBuffer('image/png');
      const { AttachmentBuilder } = require('discord.js');
      const att = new AttachmentBuilder(buf, { name: 'grafico_vendas.png' });
      const embedG = new EmbedBuilder().setColor(config.colors.success).setTitle('📈 Gráfico de Vendas — 7 dias')
        .setImage('attachment://grafico_vendas.png')
        .addFields(dias.map(d => ({ name: d.label, value: `${d.vendas} venda(s)\nR$ ${d.receita.toFixed(2)}`, inline: true })))
        .setTimestamp();
      return interaction.editReply({ embeds: [embedG], files: [att] });
    } catch {
      // Fallback sem canvas: gráfico ASCII
      const maxVendas = Math.max(...dias.map(d => d.vendas), 1);
      const linhas = dias.map(d => {
        const barras = Math.round((d.vendas / maxVendas) * 15);
        return `\`${d.label}\` ${'█'.repeat(barras)}${'░'.repeat(15-barras)} **${d.vendas}** venda(s) • R$ ${d.receita.toFixed(2)}`;
      });
      const embedG = new EmbedBuilder().setColor(config.colors.success).setTitle('📈 Vendas — Últimos 7 Dias')
        .setDescription(linhas.join('\n')).setTimestamp();
      return interaction.editReply({ embeds: [embedG] });
    }
  }

  if (id === 'pa_exportar_csv') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const pedidos = db.prepare("SELECT p.*, u.nome AS nome_usuario FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id=u.discord_id WHERE p.status IN ('pago','entregue') ORDER BY p.pago_em DESC LIMIT 1000").all();
    const linhas = ['ID,Usuário,Produto_ID,Valor,Status,Data_Pagamento,Cupom'];
    for (const p of pedidos) {
      const data = p.pago_em ? new Date(p.pago_em * 1000).toLocaleDateString('pt-BR') : '';
      linhas.push([
        p.id.slice(0,8),
        (p.nome_usuario || p.usuario_id).replace(/,/g, ' '),
        p.produto_id.slice(0,8),
        Number(p.valor_total).toFixed(2),
        p.status,
        data,
        p.cupom_usado || '',
      ].join(','));
    }
    const csv = linhas.join('\n');
    const buf = Buffer.from(csv, 'utf-8');
    const { AttachmentBuilder } = require('discord.js');
    const att = new AttachmentBuilder(buf, { name: `vendas_${new Date().toISOString().slice(0,10)}.csv` });
    return interaction.editReply({ content: `✅ ${pedidos.length} pedido(s) exportado(s).`, files: [att] });
  }

  // ─── CARRINHO ──────────────────────────────────────────────────────────────  // ─── CARRINHO ──────────────────────────────────────────────────────────────

  if (id === 'pa_criar_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const cc = require('./criarCarrinhoSub');
    await interaction.deferReply({ ephemeral: true });
    return cc.abrirSubmenu(interaction, 'criar');
  }

  if (id === 'pa_editar_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    // Listar carrinhos para escolher qual editar
    const paineis = db.prepare('SELECT p.*, pr.nome AS pnome FROM paineis_canal p JOIN produtos pr ON p.produto_id=pr.id WHERE p.ativo=1 ORDER BY p.criado_em DESC LIMIT 25').all();
    if (!paineis.length) return interaction.editReply({ content: '📋 Nenhum carrinho criado ainda.' });
    const options = paineis.map(p => ({
      label: p.pnome.slice(0, 100),
      description: `Canal: ${p.canal_id} | ID: ${p.produto_id.slice(0,8)}`,
      value: p.id,
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pa_select_editar_carrinho')
        .setPlaceholder('Selecione o carrinho para editar')
        .addOptions(options),
    );
    return interaction.editReply({ content: '✏️ Escolha o carrinho que deseja editar:', components: [row] });
  }

  if (id === 'pa_select_editar_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const painelId = interaction.values[0];
    const painel   = db.prepare('SELECT * FROM paineis_canal WHERE id=?').get(painelId);
    const produto  = painel ? db.prepare('SELECT * FROM produtos WHERE id=?').get(painel.produto_id) : null;
    if (!painel || !produto) return interaction.reply({ content: '❌ Carrinho não encontrado.', ephemeral: true });
    await interaction.deferUpdate().catch(() => {});
    const cc = require('./criarCarrinhoSub');
    return cc.abrirSubmenu(interaction, 'editar', {
      canalId:   painel.canal_id,
      titulo:    painel.titulo || produto.nome,
      descricao: painel.descricao,
      imagemUrl: painel.imagem_url,
      cor:       painel.cor || 'FF6B6B',
      painelId:  painel.id,
      produtoId: produto.id,
    });
  }

  // Submenu criar/editar carrinho (cc_*)
  if (id.startsWith('cc_')) {
    const cc = require('./criarCarrinhoSub');
    switch (id) {
      case 'cc_canal':    return cc.modalCanal(interaction);
      case 'cc_titulo':   return cc.modalTitulo(interaction);
      case 'cc_descricao': return cc.modalDescricao(interaction);
      case 'cc_imagem':   return cc.modalImagem(interaction);
      case 'cc_publicar': return cc.publicar(interaction);
      case 'cc_salvar':   return cc.salvar(interaction);
      case 'cc_cancelar': return cc.cancelar(interaction);
    }
  }

  if (id === 'pa_add_plano') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const sub = require('./adminSubmenus');
    return sub.abrirPlano(interaction);
  }

  if (id === 'pa_add_estoque') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const sub = require('./adminSubmenus');
    return sub.abrirEstoque(interaction);
  }

  if (id === 'pa_remover_plano') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_remover_plano').setTitle('➖ Remover Plano');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('variante_id').setLabel('ID da Variante').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_deletar_carrinho') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_deletar_carrinho').setTitle('🗑️ Deletar Carrinho');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('produto_id').setLabel('ID do Produto do Carrinho').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Primeiros 8 caracteres')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_listar_carrinhos') {
    await interaction.deferReply({ ephemeral: true });
    const paineis = db.prepare("SELECT p.*,pr.nome AS pnome FROM paineis_canal p JOIN produtos pr ON p.produto_id=pr.id WHERE p.ativo=1 ORDER BY p.criado_em DESC").all();
    if (!paineis.length) return interaction.editReply({ content: '📋 Nenhum carrinho criado ainda.' });
    const embed = new EmbedBuilder().setColor(config.colors.loja).setTitle('🛒 Carrinhos Ativos').setTimestamp();
    for (const p of paineis) {
      const vars = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem').all(p.produto_id);
      const linhas = vars.map(v => {
        const dig = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(v.id);
        const est = dig.c > 0 ? `${dig.c} un.` : (v.estoque === -1 ? '∞' : `${v.estoque}`);
        return `• **${v.nome}** — R$ ${Number(v.preco).toFixed(2)} (${est}) \`${v.id.slice(0,8)}\``;
      }).join('\n') || '_Sem planos_';
      embed.addFields({ name: `📦 ${p.pnome} → <#${p.canal_id}>`, value: `Produto ID: \`${p.produto_id.slice(0,8)}\`\n${linhas}`, inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── PRODUTOS ──────────────────────────────────────────────────────────────

  if (id === 'pa_add_produto') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_add_produto').setTitle('📦 Criar Produto');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('nome').setLabel('Nome do produto').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('preco').setLabel('Preço (R$) — 0 para free').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('29.90')),
      mRow(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false)),
      mRow(new TextInputBuilder().setCustomId('categoria').setLabel('Categoria (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Streaming, Games')),
      mRow(new TextInputBuilder().setCustomId('imagem').setLabel('URL da imagem (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_listar_produtos') {
    await interaction.deferReply({ ephemeral: true });
    const lista = db.prepare('SELECT * FROM produtos ORDER BY ativo DESC, vendas DESC LIMIT 20').all();
    if (!lista.length) return interaction.editReply({ content: '📦 Nenhum produto.' });
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('📦 Produtos').setTimestamp();
    for (const p of lista) {
      const digEst = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id=? AND usado=0').get(p.id);
      const varEst = db.prepare("SELECT COUNT(*) as c FROM estoque_variante ev JOIN variantes_produto vp ON ev.variante_id=vp.id WHERE vp.produto_id=? AND ev.usado=0").get(p.id);
      const total  = digEst.c + varEst.c;
      embed.addFields({
        name:  `${p.ativo ? '✅' : '❌'} ${p.nome}`,
        value: `R$ ${(p.preco_promo||p.preco).toFixed(2)} • Est: ${total > 0 ? total : p.estoque === -1 ? '∞' : p.estoque} • ${p.vendas} vendas\n\`${p.id.slice(0,8)}\``,
        inline: true,
      });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_criar_cupom') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const sub = require('./adminSubmenus');
    return sub.abrirCupom(interaction);
  }

  if (id === 'pa_listar_cupons') {
    await interaction.deferReply({ ephemeral: true });
    const cupons = db.prepare('SELECT * FROM cupons WHERE ativo=1 ORDER BY criado_em DESC LIMIT 15').all();
    if (!cupons.length) return interaction.editReply({ content: '🎟️ Nenhum cupom ativo.' });
    const embed = new EmbedBuilder().setColor(config.colors.purple).setTitle('🎟️ Cupons Ativos').setTimestamp();
    for (const c of cupons) {
      const val   = c.tipo === 'percentual' ? `${c.valor}%` : `R$ ${Number(c.valor).toFixed(2)}`;
      const exp   = c.validade ? new Date(c.validade*1000).toLocaleDateString('pt-BR') : '∞';
      const lim   = c.usos_por_usuario ? `${c.usos_por_usuario}x/user` : '1x/user';
      let lojas   = 'Todas as lojas';
      if (c.lojas_validas) {
        try {
          const arr = JSON.parse(c.lojas_validas);
          lojas = `${arr.length} loja(s) específica(s)`;
        } catch {}
      }
      embed.addFields({ name: `🎟️ ${c.codigo}`, value: `**${val}** • ${lim} • Exp: ${exp}\n🏪 ${lojas}`, inline: false });
    }
    // Botões de publicar para cada cupom (até 5)
    const rowsPub = [];
    for (let i = 0; i < Math.min(cupons.length, 5); i++) {
      const c = cupons[i];
      rowsPub.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pa_pub_cupom_${c.id}`).setLabel(`📢 Publicar: ${c.codigo}`).setStyle(ButtonStyle.Primary),
      ));
    }
    return interaction.editReply({ embeds: [embed], components: rowsPub });
  }

  if (id === 'pa_estoque_baixo') {
    await interaction.deferReply({ ephemeral: true });
    const produtos2 = db.prepare('SELECT p.*, (SELECT COUNT(*) FROM estoque_digital WHERE produto_id=p.id AND usado=0) as ed FROM produtos p WHERE p.ativo=1').all();
    const baixo = produtos2.filter(p => p.ed <= 3 && p.estoque !== -1);
    if (!baixo.length) return interaction.editReply({ content: '✅ Estoque OK.' });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('📉 Estoque Baixo').setTimestamp();
    for (const p of baixo) embed.addFields({ name: `${p.ed === 0 ? '❌' : '⚠️'} ${p.nome}`, value: `${p.ed} un. • \`${p.id.slice(0,8)}\``, inline: true });
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_top_produtos') {
    await interaction.deferReply({ ephemeral: true });
    const top = db.prepare('SELECT * FROM produtos ORDER BY vendas DESC LIMIT 10').all();
    const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle('🏆 Top Produtos').setTimestamp();
    top.forEach((p, i) => embed.addFields({ name: `${i+1}. ${p.nome}`, value: `🛒 ${p.vendas} vendas`, inline: true }));
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── GESTÃO ────────────────────────────────────────────────────────────────

  if (id === 'pa_reembolsos') {
    await interaction.deferReply({ ephemeral: true });
    const { listarPendentes } = require('./reembolsos');
    const pend = listarPendentes();
    if (!pend.length) return interaction.editReply({ content: '✅ Nenhum reembolso pendente.' });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('↩️ Reembolsos Pendentes').setTimestamp();
    for (const r of pend) embed.addFields({ name: `↩️ R$ ${Number(r.valor).toFixed(2)}`, value: `<@${r.usuario_id}> • \`${r.id.slice(0,8)}\`\n${r.motivo}`, inline: false });
    const rows2 = pend.slice(0,3).map(r => new ActionRowBuilder().addComponents(
      btn(`pa_apr_reimb_${r.id}`, `✅ Aprovar ${r.id.slice(0,6)}`, ButtonStyle.Success),
      btn(`pa_rej_reimb_${r.id}`, `❌ Rejeitar`, ButtonStyle.Danger),
    ));
    return interaction.editReply({ embeds: [embed], components: rows2 });
  }

  if (id.startsWith('pa_apr_reimb_')) {
    const { aprovarReembolso } = require('./reembolsos');
    return aprovarReembolso(interaction, id.replace('pa_apr_reimb_',''));
  }
  if (id.startsWith('pa_rej_reimb_')) {
    const modal = new ModalBuilder().setCustomId(`modal_rej_reimb_${id.replace('pa_rej_reimb_','')}`).setTitle('❌ Rejeitar Reembolso');
    modal.addComponents(mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)));
    return interaction.showModal(modal);
  }

  if (id === 'pa_tickets') {
    await interaction.deferReply({ ephemeral: true });
    const ticks = db.prepare("SELECT * FROM tickets WHERE status='aberto' ORDER BY criado_em ASC LIMIT 10").all();
    if (!ticks.length) return interaction.editReply({ content: '✅ Nenhum ticket aberto.' });
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('🎫 Tickets Abertos').setTimestamp();
    for (const t of ticks) embed.addFields({ name: `🎫 ${t.tipo.toUpperCase()}`, value: `<@${t.usuario_id}> • <#${t.canal_id}>${t.atendente ? ` • ✋ <@${t.atendente}>` : ''}`, inline: false });
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_pendentes') {
    await interaction.deferReply({ ephemeral: true });
    const pedidos = db.prepare("SELECT p.*,pr.nome as pnome FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id WHERE p.status='pendente' ORDER BY p.criado_em DESC LIMIT 10").all();
    if (!pedidos.length) return interaction.editReply({ content: '✅ Nenhum pedido pendente.' });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('⏳ Pedidos Pendentes').setTimestamp();
    for (const p of pedidos) {
      const expira = p.criado_em + 2100;
      embed.addFields({ name: `⏳ ${p.pnome}`, value: `<@${p.usuario_id}> • R$ ${Number(p.valor_total).toFixed(2)} • Expira <t:${expira}:R>`, inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Fechar todos os tickets ───────────────────────────────────────────────
  if (id === 'pa_fechar_todos_tickets') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const ticketsAbertos = db.prepare("SELECT * FROM tickets WHERE status='aberto'").all();
    if (!ticketsAbertos.length) return interaction.editReply({ content: '✅ Nenhum ticket aberto.' });

    // Fechar no banco
    db.prepare("UPDATE tickets SET status='fechado', motivo='Fechado em massa pelo admin', fechado_em=strftime('%s','now') WHERE status='aberto'").run();

    // Deletar canais do Discord
    let deletados = 0;
    for (const t of ticketsAbertos) {
      try {
        const canal = interaction.guild.channels.cache.get(t.canal_id);
        if (canal) { await canal.delete().catch(() => {}); deletados++; }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }

    await atualizarPainelAdmin(interaction.guild);
    return interaction.editReply({ content: `✅ **${ticketsAbertos.length}** ticket(s) fechado(s) no banco.\n🗑️ **${deletados}** canal(is) deletado(s).` });
  }

  // ── Cancelar todos os pedidos pendentes ───────────────────────────────────
  if (id === 'pa_cancelar_pendentes') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const pendentes = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE status='pendente'").get();
    if (!pendentes.c) return interaction.editReply({ content: '✅ Nenhum pedido pendente.' });

    db.prepare("UPDATE pedidos SET status='cancelado', motivo_cancel='Cancelado em massa pelo admin', cancelado_em=strftime('%s','now') WHERE status='pendente'").run();

    await atualizarPainelAdmin(interaction.guild);
    return interaction.editReply({ content: `✅ **${pendentes.c}** pedido(s) pendente(s) cancelado(s).` });
  }

  // ── Remover coins de um usuário ───────────────────────────────────────────
  if (id === 'pa_remover_coins') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_remover_coins').setTitle('🪙 Remover Coins de Usuário');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de coins a remover').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 500')),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  // ─── CAIXA MISTERIOSA ─────────────────────────────────────────────────────

  if (id === 'pa_caixa_criar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cx = require('./caixaSubmenu');
    return cx.abrirCriar(interaction);
  }

  // Alias antigo
  if (id === 'pa_caixa_config') {
    return handlePainelAdmin({ ...interaction, customId: 'pa_caixa_criar' }, client);
  }

  if (id === 'pa_caixa_deletar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_caixa_deletar').setTitle('🗑️ Deletar Caixa');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('caixa_id').setLabel('ID ou nome da caixa (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_caixa_add_item') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cx = require('./caixaSubmenu');
    return cx.abrirItem(interaction);
  }

  if (id === 'pa_caixa_rem_item') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_caixa_rem_item').setTitle('➖ Remover Item');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('caixa_id').setLabel('ID ou nome da caixa').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Deixe vazio para remover de todas')),
      mRow(new TextInputBuilder().setCustomId('variante_id').setLabel('ID da Variante para remover').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_caixa_toggle') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_caixa_toggle').setTitle('🔴/🟢 Ativar/Desativar Caixa');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('caixa_id').setLabel('ID ou nome da caixa').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_caixa_publicar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_caixa_publicar').setTitle('📢 Publicar Caixas no Canal');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do Canal onde publicar').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_caixa_historico') {
    await interaction.deferReply({ ephemeral: true });
    const hist = db.prepare(`
      SELECT ch.*, vp.nome as item_nome, u.nome as usuario_nome
      FROM caixa_historico ch
      JOIN variantes_produto vp ON ch.variante_id=vp.id
      LEFT JOIN usuarios u ON ch.usuario_id=u.discord_id
      ORDER BY ch.aberta_em DESC LIMIT 15
    `).all();
    if (!hist.length) return interaction.editReply({ content: '📊 Nenhuma caixa aberta ainda.' });
    const { RARIDADES } = require('./caixaMisteriosa');
    const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('📊 Histórico da Caixa Misteriosa').setTimestamp();
    for (const h of hist) {
      const rar  = RARIDADES[h.raridade] || RARIDADES.comum;
      const data = new Date(h.aberta_em * 1000).toLocaleDateString('pt-BR');
      embed.addFields({ name: `${rar.emoji} ${h.item_nome}`, value: `${h.usuario_nome || h.usuario_id} • ${rar.label} • ${data}`, inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_flashsale') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('modal_flashsale').setTitle('⚡ Flash Sale');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('produto_id').setLabel('ID do Produto').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('desconto').setLabel('Desconto (%)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('30')),
      mRow(new TextInputBuilder().setCustomId('duracao').setLabel('Duração (minutos)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('60')),
    );
    return interaction.showModal(modal);
  }

  // ─── USUÁRIOS ──────────────────────────────────────────────────────────────

  if (id === 'pa_buscar_usuario') {
    const modal = new ModalBuilder().setCustomId('pam_buscar_usuario').setTitle('🔍 Buscar Usuário');
    modal.addComponents(mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID').setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }

  if (id === 'pa_add_coins') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_add_coins').setTitle('🪙 Adicionar Coins');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de coins').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1000')),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_gerar_codigos') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner pode gerar códigos.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_gerar_codigos').setTitle('🎫 Gerar Código de Coins');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('coins').setLabel('Coins por código').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 500 (= R$5,00)')),
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de códigos (máx: 50)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 10')),
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('ID do usuário (vazio = envia só pra você)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 123456789012345678')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_anuncio') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_anuncio').setTitle('📣 Anúncio DM');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('mensagem').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('imagem').setLabel('Imagem URL (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_ranking') {
    await interaction.deferReply({ ephemeral: true });
    const top = db.prepare('SELECT * FROM usuarios ORDER BY total_gasto DESC LIMIT 10').all();
    const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle('🏆 Ranking — Maiores Compradores').setTimestamp();
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    top.forEach((u,i) => embed.addFields({ name: `${medals[i]} ${u.nome||'?'}`, value: `R$ ${(u.total_gasto||0).toFixed(2)} • ${u.total_compras||0} compras`, inline: true }));
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── Buscar pedido por ID ─────────────────────────────────────────────────
  if (id === 'pa_buscar_pedido') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_buscar_pedido').setTitle('🔍 Buscar Pedido');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pedido_id').setLabel('ID do Pedido (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: A1B2C3D4')),
    );
    return interaction.showModal(modal);
  }

  // ─── Editar preço de plano ────────────────────────────────────────────────
  if (id === 'pa_editar_plano') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_editar_plano').setTitle('✏️ Editar Plano');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('variante_id').setLabel('ID da Variante (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('nome').setLabel('Novo nome (vazio = manter)').setStyle(TextInputStyle.Short).setRequired(false)),
      mRow(new TextInputBuilder().setCustomId('preco').setLabel('Novo preço R$ (vazio = manter)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 29.90')),
    );
    return interaction.showModal(modal);
  }

  // ─── Blacklist por CPF ───────────────────────────────────────────────────
  if (id === 'pa_blacklist_cpf') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_blacklist_cpf').setTitle('🚫 Blacklist de CPF');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('acao').setLabel('Ação: bloquear ou desbloquear').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('bloquear').setValue('bloquear')),
      mRow(new TextInputBuilder().setCustomId('cpf').setLabel('CPF (só números)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('12345678901').setMaxLength(14)),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (só para bloquear)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Chargeback, fraude...')),
    );
    return interaction.showModal(modal);
  }

  // ─── Publicar cupom no canal ─────────────────────────────────────────────
  if (id.startsWith('pa_pub_cupom_')) {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const cupomId = id.replace('pa_pub_cupom_', '');
    const c = db.prepare('SELECT * FROM cupons WHERE id=?').get(cupomId);
    if (!c) return interaction.editReply({ content: '❌ Cupom não encontrado.' });

    const CANAL_CUPONS = '1530039474082283610';
    const canal = interaction.guild.channels.cache.get(CANAL_CUPONS);
    if (!canal) return interaction.editReply({ content: '❌ Canal de cupons não encontrado.' });

    const dataValidade = c.validade ? new Date(c.validade * 1000).toLocaleDateString('pt-BR') : '∞';
    const lojasLabel   = (() => {
      if (!c.lojas_validas) return 'Todas as lojas';
      try { const a = JSON.parse(c.lojas_validas); return `${a.length} loja(s) específica(s)`; } catch { return 'Todas as lojas'; }
    })();

    const embedPub = {
      color: 0xFFD700,
      title: '🎟️ Cupom de Desconto Disponível!',
      description: [
        '> Use o código abaixo para obter desconto na loja.',
        '> Cole no campo de cupom durante a compra.',
      ].join('\n'),
      fields: [
        { name: '🔑 Código',        value: `\`\`\`${c.codigo}\`\`\``,          inline: false },
        { name: '💰 Desconto',      value: `**${c.valor}%** off`,               inline: true },
        { name: '📅 Válido até',    value: `**${dataValidade}**`,                inline: true },
        { name: '👤 Usos/pessoa',   value: `**${c.usos_por_usuario || 1}x**`,   inline: true },
        { name: '🏪 Lojas válidas', value: lojasLabel,                          inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Máximo Store • Use o código acima para garantir seu desconto!' },
    };

    await canal.send({ embeds: [embedPub] });
    return interaction.editReply({ content: `✅ Cupom **\`${c.codigo}\`** publicado em <#${CANAL_CUPONS}>!` });
  }

  // ─── Dar coins para todos os usuários do servidor ───────────────────────
  if (id === 'pa_coins_todos') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_coins_todos').setTitle('🎁 Coins para Todos');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de coins para cada usuário').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 5')),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (aparece na transação)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Bônus de boas-vindas')),
    );
    return interaction.showModal(modal);
  }

  // ─── Bloquear/desbloquear usuário ────────────────────────────────────────
  if (id.startsWith('pa_bloquear_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const discordId = id.replace('pa_bloquear_', '');
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(discordId);
    if (!u) return interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true });
    if (u.bloqueado) {
      Usuarios.desbloquear(discordId);
      return interaction.reply({ content: `✅ <@${discordId}> desbloqueado com sucesso.`, ephemeral: true });
    } else {
      const modal = new ModalBuilder().setCustomId(`pam_bloquear_${discordId}`).setTitle('🚫 Bloquear Usuário');
      modal.addComponents(
        mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo do bloqueio').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Chargeback, fraude...')),
      );
      return interaction.showModal(modal);
    }
  }
}

// ─── Handler de modais pam_* ──────────────────────────────────────────────────
async function handlePainelAdminModals(interaction, client) {
  const id = interaction.customId;
  try {

  if (id === 'pam_criar_carrinho') {
    await interaction.deferReply({ ephemeral: true });
    const canalId   = interaction.fields.getTextInputValue('canal_id').trim();
    const titulo    = interaction.fields.getTextInputValue('titulo').trim();
    const descricao = interaction.fields.getTextInputValue('descricao').trim();
    const imagemUrl = interaction.fields.getTextInputValue('imagem').trim();
    const corHex    = interaction.fields.getTextInputValue('cor').trim() || 'FF6B6B';

    const canal = interaction.guild.channels.cache.get(canalId);
    if (!canal) return interaction.editReply({ content: `❌ Canal \`${canalId}\` não encontrado.` });

    const { v4: uuidv4 } = require('uuid');
    const produtoId = uuidv4();
    // Produto sem estoque manual (estoque adicionado depois)
    db.prepare('INSERT INTO produtos (id,nome,descricao,preco,imagem_url,tipo,ativo,estoque,criado_por) VALUES (?,?,?,0,?,?,1,-1,?)')
      .run(produtoId, titulo, descricao, imagemUrl||null, 'digital', interaction.user.id);

    const painelId = uuidv4();
    db.prepare('INSERT INTO paineis_canal (id,canal_id,produto_id,titulo,descricao,cor,imagem_url,criado_por) VALUES (?,?,?,?,?,?,?,?)')
      .run(painelId, canal.id, produtoId, titulo, descricao, corHex, imagemUrl||null, interaction.user.id);

    const cor   = parseInt(corHex, 16) || config.colors.loja;
    const embed = new EmbedBuilder()
      .setColor(cor)
      .setTitle(`🛍️ ${titulo}`)
      .setTimestamp()
      .setFooter({ text: 'Máximo Store' });

    // Só mostra descrição se houver — sem campos de estoque/planos
    if (descricao) embed.setDescription(descricao);

    const payload = { embeds: [embed], components: [] };
    if (imagemUrl) embed.setImage(imagemUrl);

    const msg = await canal.send(payload);
    db.prepare('UPDATE paineis_canal SET mensagem_id=? WHERE id=?').run(msg.id, painelId);

    return interaction.editReply({
      content: [
        `✅ Carrinho criado em <#${canal.id}>!`,
        `🆔 Produto ID: \`${produtoId.slice(0,8)}\``,
        '',
        `➡️ Próximo passo: clique em **+ Adicionar Plano** e use o ID \`${produtoId.slice(0,8)}\``,
      ].join('\n'),
    });
  }

  if (id === 'pam_add_plano') {
    await interaction.deferReply({ ephemeral: true });
    const busca  = interaction.fields.getTextInputValue('produto_id').trim();
    const nome   = interaction.fields.getTextInputValue('nome').trim();
    const preco  = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',','.'));
    const desc   = interaction.fields.getTextInputValue('descricao').trim();
    if (isNaN(preco)||preco<0) return interaction.editReply({ content: '❌ Preço inválido.' });

    const produto = db.prepare("SELECT * FROM produtos WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!produto) return interaction.editReply({ content: `❌ Produto \`${busca}\` não encontrado. Use o ID correto de 8 caracteres.` });

    const { v4: uuidv4 } = require('uuid');
    const ordem  = db.prepare('SELECT COUNT(*) as c FROM variantes_produto WHERE produto_id=?').get(produto.id).c + 1;
    const varId  = uuidv4();
    // Estoque começa como 0 — só terá itens quando o estoque digital for adicionado
    db.prepare('INSERT INTO variantes_produto (id,produto_id,nome,descricao,preco,estoque,ordem) VALUES (?,?,?,?,?,0,?)')
      .run(varId, produto.id, nome, desc, preco, ordem);

    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(produto.id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(()=>{});

    return interaction.editReply({
      content: [
        `✅ Plano **${nome}** adicionado a **${produto.nome}**!`,
        `💵 R$ ${preco.toFixed(2)} • Estoque: 0 (adicione com 📥 Add Estoque)`,
        `🆔 Variante ID: \`${varId.slice(0,8)}\``,
        '',
        `➡️ Para adicionar estoque: clique em **📥 Add Estoque** com o ID \`${varId.slice(0,8)}\``,
      ].join('\n'),
    });
  }

  if (id === 'pam_add_estoque') {
    await interaction.deferReply({ ephemeral: true });
    const busca    = interaction.fields.getTextInputValue('variante_id').trim();
    const conteudo = interaction.fields.getTextInputValue('conteudo').trim();

    const variante = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!variante) return interaction.editReply({ content: `❌ Variante \`${busca}\` não encontrada.` });

    const { v4: uuidv4 } = require('uuid');
    // 1 linha = 1 produto
    const itens = conteudo.split('\n').map(s => s.trim()).filter(Boolean);
    for (const item of itens) {
      db.prepare('INSERT INTO estoque_variante (id,variante_id,conteudo) VALUES (?,?,?)').run(uuidv4(), variante.id, item);
    }
    const total = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(variante.id).c;
    db.prepare('UPDATE variantes_produto SET estoque=? WHERE id=?').run(total, variante.id);

    // Atualiza só estoque/componentes — imagem preservada
    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(variante.produto_id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(()=>{});

    return interaction.editReply({
      content: [
        `✅ **${itens.length}** item(ns) adicionado(s) à variante **${variante.nome}**!`,
        `📦 Total disponível: **${total}** unidade(s)`,
        paineis.length ? `🔄 ${paineis.length} painel(is) atualizado(s) _(imagem preservada)_` : '',
      ].filter(Boolean).join('\n'),
    });
  }

  if (id === 'pam_remover_plano') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('variante_id').trim();
    const v = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!v) return interaction.editReply({ content: '❌ Variante não encontrada.' });
    db.prepare('UPDATE variantes_produto SET ativo=0 WHERE id=?').run(v.id);
    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(v.produto_id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(()=>{});
    return interaction.editReply({ content: `✅ Plano **${v.nome}** removido.` });
  }

  if (id === 'pam_deletar_carrinho') {
    await interaction.deferReply({ ephemeral: true });
    const busca   = interaction.fields.getTextInputValue('produto_id').trim();
    const produto = db.prepare("SELECT * FROM produtos WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!produto) return interaction.editReply({ content: `❌ Produto \`${busca}\` não encontrado.` });

    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(produto.id);

    // Deletar mensagem do Discord em cada canal
    for (const painel of paineis) {
      try {
        const canal = interaction.guild.channels.cache.get(painel.canal_id);
        if (canal && painel.mensagem_id) {
          const msg = await canal.messages.fetch(painel.mensagem_id).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }
      } catch {}
      db.prepare('UPDATE paineis_canal SET ativo=0 WHERE id=?').run(painel.id);
    }

    // Desativar produto e variantes
    db.prepare('UPDATE produtos SET ativo=0 WHERE id=?').run(produto.id);
    db.prepare('UPDATE variantes_produto SET ativo=0 WHERE produto_id=?').run(produto.id);

    return interaction.editReply({
      content: [
        `✅ Carrinho **${produto.nome}** deletado!`,
        `🗑️ ${paineis.length} painel(is) removido(s) dos canais.`,
      ].join('\n'),
    });
  }

  if (id === 'pam_add_produto') {
    await interaction.deferReply({ ephemeral: true });
    const nome  = interaction.fields.getTextInputValue('nome').trim();
    const preco = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',','.'));
    const desc  = interaction.fields.getTextInputValue('descricao').trim();
    const cat   = interaction.fields.getTextInputValue('categoria').trim() || 'Geral';
    const img   = interaction.fields.getTextInputValue('imagem').trim();
    if (isNaN(preco)||preco<0) return interaction.editReply({ content: '❌ Preço inválido.' });
    const { v4: uuidv4 } = require('uuid');
    const pid = uuidv4();
    db.prepare('INSERT INTO produtos (id,nome,descricao,preco,imagem_url,categoria,tipo,ativo,estoque,criado_por) VALUES (?,?,?,?,?,?,?,1,-1,?)')
      .run(pid, nome, desc, preco, img||null, cat, 'digital', interaction.user.id);
    return interaction.editReply({ content: `✅ Produto **${nome}** criado!\n🆔 ID: \`${pid.slice(0,8)}\`` });
  }

  if (id === 'pam_criar_cupom') {
    await interaction.deferReply({ ephemeral: true });
    const cod            = interaction.fields.getTextInputValue('codigo').trim();
    const valor          = parseFloat(interaction.fields.getTextInputValue('valor').trim().replace(',','.'));
    const usosPorUsuario = parseInt(interaction.fields.getTextInputValue('usos_por_usuario').trim()) || 1;
    const dias           = parseInt(interaction.fields.getTextInputValue('validade').trim()) || 30;
    const lojasRaw       = interaction.fields.getTextInputValue('lojas').trim();

    if (isNaN(valor) || valor <= 0 || valor > 100) return interaction.editReply({ content: '❌ Percentual inválido. Use um número entre 1 e 100.' });

    // Processar lojas: buscar painelId pelo produto_id parcial
    let lojasValidas = null;
    if (lojasRaw) {
      const ids = lojasRaw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      const painelIds = [];
      for (const id of ids) {
        const painel = db.prepare("SELECT id FROM paineis_canal WHERE produto_id LIKE ? AND ativo=1").get(`${id}%`);
        if (painel) painelIds.push(painel.id);
        else {
          // Tentar como painelId diretamente
          const p2 = db.prepare("SELECT id FROM paineis_canal WHERE id LIKE ? AND ativo=1").get(`${id}%`);
          if (p2) painelIds.push(p2.id);
        }
      }
      if (painelIds.length > 0) lojasValidas = JSON.stringify(painelIds);
    }

    const { gerarCodigoCupom } = require('./cupons');
    const codigo = cod || gerarCodigoCupom();

    // Salvar no DB — compatível com banco sem as colunas novas
    const { v4: uuidv4 } = require('uuid');
    const cupomId    = uuidv4();
    const validadeTs = Math.floor(Date.now() / 1000) + (dias * 86400);

    // Garantir colunas novas existem (migração segura)
    try { db.exec('ALTER TABLE cupons ADD COLUMN usos_por_usuario INTEGER DEFAULT 1'); } catch {}
    try { db.exec('ALTER TABLE cupons ADD COLUMN lojas_validas TEXT DEFAULT NULL'); } catch {}

    db.prepare(`
      INSERT INTO cupons (id, codigo, tipo, valor, usos_max, usos_por_usuario, validade, lojas_validas, criado_por)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(cupomId, codigo.toUpperCase(), 'percentual', valor, 9999, usosPorUsuario, validadeTs, lojasValidas, interaction.user.id);

    const lojasMsg = lojasValidas
      ? `\n🏪 Válido em **${JSON.parse(lojasValidas).length}** loja(s) específica(s)`
      : '\n🏪 Válido em **todas as lojas**';

    return interaction.editReply({ content: [
      `✅ Cupom **\`${codigo.toUpperCase()}\`** criado!`,
      `💰 Desconto: **${valor}%**`,
      `👤 Limite por usuário: **${usosPorUsuario}x**`,
      `📅 Validade: **${dias} dias**`,
      lojasMsg,
    ].join('\n') });
  }

  if (id === 'pam_buscar_usuario') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g,'');
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(busca);
    if (!u) return interaction.editReply({ content: `❌ ID \`${busca}\` não encontrado.` });
    const pedidos = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE usuario_id=? AND status IN ('pago','entregue')").get(u.discord_id);
    // Últimos 3 pedidos
    const ultimosPedidos = db.prepare("SELECT p.*, pr.nome AS pnome FROM pedidos p LEFT JOIN produtos pr ON p.produto_id=pr.id WHERE p.usuario_id=? ORDER BY p.criado_em DESC LIMIT 3").all(u.discord_id);
    const statusE = { pendente:'⏳', pago:'✅', entregue:'📦', cancelado:'❌' };
    const pedidosLabel = ultimosPedidos.length
      ? ultimosPedidos.map(p => `${statusE[p.status]||'?'} ${(p.pnome||'?').slice(0,20)} — R$ ${Number(p.valor_total).toFixed(2)} \`${p.id.slice(0,8)}\``).join('\n')
      : 'Nenhum pedido';

    const embed = new EmbedBuilder().setColor(config.colors.info).setTitle(`👤 ${u.nome||'?'}`).addFields(
      { name:'🆔 ID',         value: u.discord_id,                                inline: true },
      { name:'💵 Saldo',      value: `R$ ${(u.saldo||0).toFixed(2)}`,             inline: true },
      { name:'🪙 Coins',      value: String(u.coins||0),                          inline: true },
      { name:'⭐ Pontos',     value: String(u.pontos||0),                         inline: true },
      { name:'🛒 Compras',    value: String(pedidos.c),                           inline: true },
      { name:'💸 Gasto',      value: `R$ ${(u.total_gasto||0).toFixed(2)}`,      inline: true },
      { name:'🚫 Bloqueado',  value: u.bloqueado ? `Sim — ${u.motivo_bloquio}` : 'Não', inline: false },
      { name:'📋 Últimos Pedidos', value: pedidosLabel,                           inline: false },
    ).setTimestamp();

    const rowAcoes = new ActionRowBuilder().addComponents(
      btn(`pa_bloquear_${u.discord_id}`,   u.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear', u.bloqueado ? ButtonStyle.Success : ButtonStyle.Danger),
    );
    return interaction.editReply({ embeds: [embed], components: [rowAcoes] });
  }

  if (id === 'pam_add_coins') {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g,'');
    const qtd       = parseInt(interaction.fields.getTextInputValue('quantidade').trim());
    const motivo    = interaction.fields.getTextInputValue('motivo').trim() || `Adicionado por ${interaction.user.tag}`;
    if (isNaN(qtd)||qtd<=0) return interaction.editReply({ content: '❌ Quantidade inválida.' });
    Usuarios.garantir(discordId, 'Usuário');
    const { addCoins, coinsParaReais, COIN_EMOJI } = require('./coins');
    const novo = addCoins(discordId, qtd, motivo, interaction.user.id);
    const member = await interaction.guild.members.fetch(discordId).catch(()=>null);
    if (member) member.send({ embeds: [new EmbedBuilder().setColor(config.colors.coins).setTitle(`${COIN_EMOJI} Coins Recebidos!`).setDescription(`O Owner adicionou **${qtd.toLocaleString('pt-BR')} coins**!\nSaldo: **${novo.toLocaleString('pt-BR')} coins** (R$ ${coinsParaReais(novo).toFixed(2)})\n📝 ${motivo}`).setTimestamp()] }).catch(()=>{});
    return interaction.editReply({ content: `✅ **${qtd.toLocaleString('pt-BR')} coins** adicionados a <@${discordId}>!` });
  }

  if (id === 'pam_remover_coins') {
    await interaction.deferReply({ ephemeral: true });
    if (!isOwner(interaction.member)) return interaction.editReply({ content: '❌ Apenas o Owner.' });
    const discordId2 = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g,'');
    const qtd2       = parseInt(interaction.fields.getTextInputValue('quantidade').trim());
    const motivo2    = interaction.fields.getTextInputValue('motivo').trim() || `Removido por ${interaction.user.tag}`;
    if (isNaN(qtd2) || qtd2 <= 0) return interaction.editReply({ content: '❌ Quantidade inválida.' });
    const u2 = db.prepare('SELECT coins FROM usuarios WHERE discord_id=?').get(discordId2);
    if (!u2) return interaction.editReply({ content: '❌ Usuário não encontrado.' });
    const atual = u2.coins || 0;
    if (atual < qtd2) return interaction.editReply({ content: `❌ Usuário tem apenas **${atual.toLocaleString('pt-BR')} coins**.` });
    const novo2 = atual - qtd2;
    db.prepare('UPDATE usuarios SET coins=? WHERE discord_id=?').run(novo2, discordId2);
    const { COIN_EMOJI } = require('./coins');
    const member2 = await interaction.guild.members.fetch(discordId2).catch(() => null);
    if (member2) member2.send({ embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle(`${COIN_EMOJI} Coins Removidos`).setDescription(`**${qtd2.toLocaleString('pt-BR')} coins** foram removidos da sua conta.\n📝 ${motivo2}\nSaldo atual: **${novo2.toLocaleString('pt-BR')} coins**`).setTimestamp()] }).catch(()=>{});
    return interaction.editReply({ content: `✅ **${qtd2.toLocaleString('pt-BR')} coins** removidos de <@${discordId2}>. Novo saldo: ${novo2.toLocaleString('pt-BR')} coins.` });
  }

  // ─── Modais da Caixa Misteriosa ──────────────────────────────────────────────

  if (id === 'pam_caixa_config') {
    await interaction.deferReply({ ephemeral: true });
    const nome       = interaction.fields.getTextInputValue('nome').trim();
    const preco      = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',','.'));
    const canal_id   = interaction.fields.getTextInputValue('canal_id').trim();
    const descricao  = interaction.fields.getTextInputValue('descricao').trim();
    const imagem     = interaction.fields.getTextInputValue('imagem').trim();
    if (isNaN(preco)||preco<=0) return interaction.editReply({ content: '❌ Preço inválido.' });

    // Criar sempre uma nova caixa (múltiplas caixas suportadas)
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT INTO caixa_config (id,nome,preco,canal_id,descricao,imagem_url,criado_por) VALUES (?,?,?,?,?,?,?)')
      .run(uuidv4(), nome, preco, canal_id, descricao||null, imagem||null, interaction.user.id);
    return interaction.editReply({ content: `✅ Caixa **${nome}** criada!\n💵 R$ ${preco.toFixed(2)} • Canal: <#${canal_id}>\n\n➡️ Agora clique em **🎯 Add Item** e informe o nome desta caixa para adicionar produtos.` });
  }

  if (id === 'pam_caixa_add_item') {
    await interaction.deferReply({ ephemeral: true });
    const caixaBusca = interaction.fields.getTextInputValue('caixa_id').trim();
    const varBusca   = interaction.fields.getTextInputValue('variante_id').trim();
    const raridade   = interaction.fields.getTextInputValue('raridade').trim().toLowerCase();
    const chance     = parseFloat(interaction.fields.getTextInputValue('chance').trim().replace(',','.'));
    const { RARIDADES } = require('./caixaMisteriosa');

    if (!RARIDADES[raridade]) return interaction.editReply({ content: '❌ Raridade inválida. Use: comum, raro, epico ou lendario' });
    if (isNaN(chance)||chance<=0||chance>100) return interaction.editReply({ content: '❌ Chance inválida (1-100).' });

    const caixa = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(caixaBusca, `${caixaBusca}%`, caixaBusca);
    if (!caixa) return interaction.editReply({ content: `❌ Caixa \`${caixaBusca}\` não encontrada.` });

    const variante = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(varBusca, `${varBusca}%`);
    if (!variante) return interaction.editReply({ content: `❌ Variante \`${varBusca}\` não encontrada.` });

    // Verificar total de chances desta caixa
    const totalAtual = db.prepare('SELECT COALESCE(SUM(chance),0) as t FROM caixa_itens_config WHERE caixa_id=? AND ativa=1').get(caixa.id).t;
    const novoTotal  = totalAtual + chance;
    if (novoTotal > 100.1) return interaction.editReply({ content: `❌ Total de chances ultrapassa 100%!\nAtual: **${totalAtual}%** + **${chance}%** = **${novoTotal}%**` });

    const { v4: uuidv4 } = require('uuid');
    const existeItem = db.prepare('SELECT * FROM caixa_itens_config WHERE caixa_id=? AND variante_id=?').get(caixa.id, variante.id);
    if (existeItem) {
      db.prepare('UPDATE caixa_itens_config SET raridade=?,chance=?,ativa=1 WHERE id=?').run(raridade, chance, existeItem.id);
    } else {
      db.prepare('INSERT INTO caixa_itens_config (id,caixa_id,variante_id,raridade,chance) VALUES (?,?,?,?,?)').run(uuidv4(), caixa.id, variante.id, raridade, chance);
    }

    const rar  = RARIDADES[raridade];
    const prod = db.prepare('SELECT nome FROM produtos WHERE id=?').get(variante.produto_id);
    return interaction.editReply({
      content: [
        `✅ Item adicionado à **${caixa.nome}**!`,
        `${rar.emoji} **${prod?.nome} › ${variante.nome}** — ${chance}% de drop`,
        `📊 Total desta caixa: **${novoTotal.toFixed(1)}%** / 100%`,
        novoTotal < 99.9 ? `⚠️ Faltam **${(100-novoTotal).toFixed(1)}%** para completar 100%` : '✅ Total completo!',
      ].join('\n'),
    });
  }

  if (id === 'pam_caixa_deletar') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: '❌ Apenas admins.' });
    const busca  = interaction.fields.getTextInputValue('caixa_id').trim();
    const caixa  = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(busca, `${busca}%`, busca);
    if (!caixa) return interaction.editReply({ content: `❌ Caixa \`${busca}\` não encontrada.` });

    // Deletar embed do canal
    if (caixa.canal_id && caixa.mensagem_id) {
      try {
        const canal = interaction.guild.channels.cache.get(caixa.canal_id);
        const msg   = await canal?.messages.fetch(caixa.mensagem_id).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      } catch {}
    }

    // Desativar no banco
    db.prepare('UPDATE caixa_config SET ativa=0 WHERE id=?').run(caixa.id);
    db.prepare('UPDATE caixa_itens_config SET ativa=0 WHERE caixa_id=?').run(caixa.id);

    return interaction.editReply({ content: `✅ Caixa **${caixa.nome}** deletada e embed removido do canal.` });
  }

  if (id === 'pam_caixa_rem_item') {
    await interaction.deferReply({ ephemeral: true });
    const varBusca  = interaction.fields.getTextInputValue('variante_id').trim();
    const caixaBusca = interaction.fields.getTextInputValue('caixa_id')?.trim() || '';
    // Buscar na caixa específica se informada, senão remove de todas
    const variante = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(varBusca, `${varBusca}%`);
    if (!variante) return interaction.editReply({ content: '❌ Variante não encontrada.' });
    if (caixaBusca) {
      const caixa = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(caixaBusca, `${caixaBusca}%`, caixaBusca);
      if (!caixa) return interaction.editReply({ content: '❌ Caixa não encontrada.' });
      db.prepare('UPDATE caixa_itens_config SET ativa=0 WHERE caixa_id=? AND variante_id=?').run(caixa.id, variante.id);
      return interaction.editReply({ content: `✅ Item **${variante.nome}** removido da caixa **${caixa.nome}**.` });
    }
    db.prepare('UPDATE caixa_itens_config SET ativa=0 WHERE variante_id=?').run(variante.id);
    return interaction.editReply({ content: `✅ Item **${variante.nome}** removido de todas as caixas.` });
  }

  if (id === 'pam_caixa_toggle') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('caixa_id').trim();
    const caixa = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(busca, `${busca}%`, busca);
    if (!caixa) return interaction.editReply({ content: `❌ Caixa \`${busca}\` não encontrada.` });
    db.prepare('UPDATE caixa_config SET ativa=? WHERE id=?').run(caixa.ativa ? 0 : 1, caixa.id);
    return interaction.editReply({ content: `✅ Caixa **${caixa.nome}** ${caixa.ativa ? '🔴 desativada' : '🟢 ativada'}!` });
  }

  if (id === 'pam_caixa_publicar') {
    await interaction.deferReply({ ephemeral: true });
    const canalId = interaction.fields.getTextInputValue('canal_id').trim();
    const { enviarEmbedCaixasCanal } = require('./caixaMisteriosa');
    await enviarEmbedCaixasCanal(interaction.guild, canalId);
    return interaction.editReply({ content: `✅ Embed das caixas publicado em <#${canalId}>!` });
  }

  if (id === 'pam_gerar_codigos') {
    await interaction.deferReply({ ephemeral: true });
    if (!isOwner(interaction.member)) return interaction.editReply({ content: '❌ Apenas o Owner.' });
    const coins = parseInt(interaction.fields.getTextInputValue('coins').trim());
    const qtd2  = Math.min(parseInt(interaction.fields.getTextInputValue('quantidade').trim()), 50);
    const alvoId = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g, '') || null;
    if (isNaN(coins)||coins<=0) return interaction.editReply({ content: '❌ Valor de coins inválido.' });
    if (isNaN(qtd2)||qtd2<=0)  return interaction.editReply({ content: '❌ Quantidade inválida.' });

    const { gerarCodigos } = require('./codigosCoins');
    const { COIN_EMOJI: CE } = require('./coins');
    const codigos    = gerarCodigos({ quantidade: qtd2, coinsValor: coins, criadoPor: interaction.user.id });
    const valorReais = (coins * 0.01).toFixed(2);

    const embedCod = new EmbedBuilder()
      .setColor(config.colors.coins || config.colors.gold)
      .setTitle(`🎫 ${qtd2} Código(s) de Coins`)
      .setDescription([
        `${CE} **Valor:** ${coins.toLocaleString('pt-BR')} coins (R$ ${valorReais}) cada`,
        `📦 **Quantidade:** ${qtd2}`,
        `🔒 Uso único por código`,
        '',
        '```',
        codigos.join('\n'),
        '```',
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Guarde com segurança!' });

    // Enviar para o usuário informado ou para o próprio admin
    let enviado = false;
    if (alvoId) {
      try {
        const guild  = interaction.guild;
        const member = await guild.members.fetch(alvoId).catch(() => null);
        if (member) {
          await member.send({ embeds: [embedCod] });
          enviado = true;
          return interaction.editReply({ content: `✅ **${qtd2} código(s)** gerado(s) e enviado(s) no privado de <@${alvoId}>!\n${CE} ${coins.toLocaleString('pt-BR')} coins (R$ ${valorReais}) cada.` });
        } else {
          return interaction.editReply({ content: `❌ Usuário \`${alvoId}\` não encontrado no servidor.` });
        }
      } catch {
        return interaction.editReply({ content: `❌ Não foi possível enviar DM para <@${alvoId}>. A pessoa pode ter DMs desativadas.` });
      }
    }

    // Sem ID informado — envia para o admin
    await interaction.user.send({ embeds: [embedCod] }).catch(() => {});
    return interaction.editReply({ content: `✅ **${qtd2} código(s)** gerado(s)!\n${CE} ${coins.toLocaleString('pt-BR')} coins (R$ ${valorReais}) cada.\nCódigos enviados na sua **DM**.` });
  }

  if (id === 'pam_anuncio') {
    await interaction.deferReply({ ephemeral: true });
    const titulo   = interaction.fields.getTextInputValue('titulo').trim();
    const mensagem = interaction.fields.getTextInputValue('mensagem').trim();
    const imagem   = interaction.fields.getTextInputValue('imagem').trim();
    const { enviarAnuncio } = require('./anuncios');
    return enviarAnuncio(interaction, { titulo, mensagem, imagemUrl: imagem||null });
  }

  if (id === 'pam_buscar_pedido') {
    await interaction.deferReply({ ephemeral: true });
    const busca  = interaction.fields.getTextInputValue('pedido_id').trim().toUpperCase();
    const pedido = db.prepare("SELECT p.*, u.nome AS nome_usuario, pr.nome AS nome_produto FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id=u.discord_id LEFT JOIN produtos pr ON p.produto_id=pr.id WHERE UPPER(SUBSTR(p.id,1,8))=?").get(busca);
    if (!pedido) return interaction.editReply({ content: `❌ Pedido \`${busca}\` não encontrado.` });
    const statusEmoji = { pendente:'⏳', pago:'✅', entregue:'📦', cancelado:'❌', reembolsado:'↩️' };
    const embed = new EmbedBuilder().setColor(config.colors.info).setTitle(`🔍 Pedido ${busca}`)
      .addFields(
        { name: '👤 Cliente',   value: `<@${pedido.usuario_id}> (${pedido.nome_usuario || '?'})`, inline: false },
        { name: '📦 Produto',   value: pedido.nome_produto || pedido.produto_id.slice(0,8),         inline: true },
        { name: '💵 Valor',     value: `R$ ${Number(pedido.valor_total).toFixed(2)}`,               inline: true },
        { name: '📊 Status',    value: `${statusEmoji[pedido.status]||'?'} ${pedido.status}`,       inline: true },
        { name: '🎟️ Cupom',    value: pedido.cupom_usado || '—',                                   inline: true },
        { name: '📅 Criado em', value: pedido.criado_em ? `<t:${pedido.criado_em}:f>` : '—',       inline: true },
      ).setTimestamp();
    const rowAcoes = new ActionRowBuilder().addComponents(
      btn(`ticket_aceitar_sem_pag_${pedido.id}`, '✅ Liberar', ButtonStyle.Success),
      btn(`pa_bloquear_${pedido.usuario_id}`,    '🚫 Bloquear', ButtonStyle.Danger),
    );
    return interaction.editReply({ embeds: [embed], components: [rowAcoes] });
  }

  if (id === 'pam_editar_plano') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('variante_id').trim();
    const novoNome  = interaction.fields.getTextInputValue('nome').trim();
    const novoPreco = interaction.fields.getTextInputValue('preco').trim().replace(',', '.');
    const variante  = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!variante) return interaction.editReply({ content: `❌ Variante \`${busca}\` não encontrada.` });
    if (novoNome)  db.prepare('UPDATE variantes_produto SET nome=? WHERE id=?').run(novoNome, variante.id);
    if (novoPreco) {
      const p = parseFloat(novoPreco);
      if (!isNaN(p) && p >= 0) db.prepare('UPDATE variantes_produto SET preco=? WHERE id=?').run(p, variante.id);
    }
    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(variante.produto_id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(() => {});
    const atualizado = db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(variante.id);
    return interaction.editReply({ content: `✅ Plano atualizado!\n**${atualizado.nome}** — R$ ${Number(atualizado.preco).toFixed(2)}` });
  }

  if (id === 'pam_blacklist_cpf') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: '❌ Apenas admins.' });
    const acao   = interaction.fields.getTextInputValue('acao').trim().toLowerCase();
    const cpf    = interaction.fields.getTextInputValue('cpf').trim().replace(/\D/g, '');
    const motivo = interaction.fields.getTextInputValue('motivo').trim() || 'Bloqueado pelo admin';
    if (cpf.length < 11) return interaction.editReply({ content: '❌ CPF inválido (mínimo 11 dígitos).' });
    const { bloquearCpf, desbloquearCpf, listarCpfsBloqueados } = require('./antiFraude');
    if (acao.includes('des')) {
      desbloquearCpf(cpf);
      return interaction.editReply({ content: `✅ CPF \`${cpf}\` desbloqueado.` });
    } else {
      bloquearCpf(cpf, motivo, interaction.user.id);
      return interaction.editReply({ content: `🚫 CPF \`${cpf}\` bloqueado.\n**Motivo:** ${motivo}` });
    }
  }

  if (id.startsWith('pam_bloquear_')) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = id.replace('pam_bloquear_', '');
    const motivo    = interaction.fields.getTextInputValue('motivo').trim();
    Usuarios.bloquear(discordId, motivo);
    return interaction.editReply({ content: `🚫 <@${discordId}> bloqueado com sucesso.\n**Motivo:** ${motivo}` });
  }

  if (id === 'pam_coins_todos') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: '❌ Apenas admins.' });
    const qtd    = parseInt(interaction.fields.getTextInputValue('quantidade').trim());
    const motivo = interaction.fields.getTextInputValue('motivo').trim() || 'Bônus para todos';
    if (isNaN(qtd) || qtd <= 0) return interaction.editReply({ content: '❌ Quantidade inválida.' });

    const { addCoins, COIN_EMOJI } = require('./coins');
    const usuarios = db.prepare('SELECT discord_id FROM usuarios').all();
    let count = 0;
    for (const u of usuarios) {
      try { addCoins(u.discord_id, qtd, motivo); count++; } catch {}
    }
    return interaction.editReply({ content: `✅ **${qtd} ${COIN_EMOJI}** adicionados para **${count}** usuários!\n**Motivo:** ${motivo}` });
  }
  } catch (err) {
    console.error('[PainelAdminModals] Erro:', err.message, '| modal:', interaction.customId);
    const responder = interaction.deferred ? 'editReply' : 'reply';
    return interaction[responder]({ content: `❌ Erro: \`${err.message.slice(0, 200)}\``, ephemeral: true }).catch(() => {});
  }
}

// ─── Utilitário ───────────────────────────────────────────────────────────────
function btn(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}
function mRow(input) {
  return new ActionRowBuilder().addComponents(input);
}

module.exports = {
  enviarPainelFixo,
  atualizarPainelAdmin,
  handlePainelAdmin,
  handlePainelAdminModals,
  CANAL_PAINEL,
};

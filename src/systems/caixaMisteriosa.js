/**
 * Sistema de Caixa Misteriosa
 * - Múltiplas caixas configuráveis, cada uma com seus itens e % de drop
 * - Venda igual ao carrinho: embed no canal → ticket → PIX ou Coins
 * - Itens = variantes de produtos já cadastrados nos carrinhos
 * - 4 raridades: Comum, Raro, Épico, Lendário
 * - Entrega o item do estoque digital no privado do usuário
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { db, Usuarios, Pedidos } = require('../database/database');
const { log }           = require('../utils/logger');
const { pegarItemVariante } = require('./painelProduto');
const { v4: uuidv4 }    = require('uuid');
const config             = require('../config');

// ─── Raridades ────────────────────────────────────────────────────────────────
const RARIDADES = {
  comum:    { label: 'Comum',    emoji: '⚪', cor: 0x95A5A6, stars: '⭐'       },
  raro:     { label: 'Raro',     emoji: '🔵', cor: 0x3498DB, stars: '⭐⭐'     },
  epico:    { label: 'Épico',    emoji: '🟣', cor: 0x9B59B6, stars: '⭐⭐⭐'   },
  lendario: { label: 'Lendário', emoji: '🌟', cor: 0xF1C40F, stars: '⭐⭐⭐⭐' },
};

// ─── Listar todas as caixas ativas ────────────────────────────────────────────
function listarCaixasAtivas() {
  return db.prepare("SELECT * FROM caixa_config WHERE ativa=1 ORDER BY criado_em ASC").all();
}

// ─── Obter caixa por ID ───────────────────────────────────────────────────────
function getCaixa(id) {
  return db.prepare('SELECT * FROM caixa_config WHERE id=?').get(id);
}

// ─── Itens de uma caixa específica ───────────────────────────────────────────
function getItensCaixa(caixaId) {
  return db.prepare(`
    SELECT ci.*, vp.nome as variante_nome, vp.descricao as variante_desc,
           vp.preco, pr.nome as produto_nome, pr.imagem_url,
           (SELECT COUNT(*) FROM estoque_variante WHERE variante_id=ci.variante_id AND usado=0) as estoque
    FROM caixa_itens_config ci
    JOIN variantes_produto vp ON ci.variante_id = vp.id
    JOIN produtos pr ON vp.produto_id = pr.id
    WHERE ci.caixa_id=? AND ci.ativa=1
    ORDER BY ci.chance DESC
  `).all(caixaId);
}

// ─── Sortear item de uma caixa ────────────────────────────────────────────────
function sortearItem(caixaId) {
  const itens = getItensCaixa(caixaId).filter(i => i.estoque > 0);
  if (!itens.length) return null;
  const totalChance = itens.reduce((acc, i) => acc + i.chance, 0);
  let rand = Math.random() * totalChance;
  for (const item of itens) {
    rand -= item.chance;
    if (rand <= 0) return item;
  }
  return itens[itens.length - 1];
}

// ─── Enviar embed do canal com select de caixas ───────────────────────────────
async function enviarEmbedCaixasCanal(guild, canalId) {
  const canal = guild.channels.cache.get(canalId);
  if (!canal) return;

  const caixas = listarCaixasAtivas();
  if (!caixas.length) return;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎁 Caixas Misteriosas')
    .setDescription([
      '> Abra uma caixa e descubra o que está dentro!',
      '> Pague via **PIX** ou **🪙 Coins** e receba no privado.',
      '',
      ...caixas.map(c => {
        const itens = getItensCaixa(c.id);
        const totalEst = itens.reduce((a, i) => a + i.estoque, 0);
        const linhas = itens.map(i => `${RARIDADES[i.raridade]?.emoji || '⚪'} **${i.variante_nome}** — ${i.chance}%`);
        return [
          `**🎁 ${c.nome}** — R$ ${c.preco.toFixed(2)} | ${totalEst} itens disponíveis`,
          ...linhas,
        ].join('\n');
      }),
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: `Máximo Store • ${caixas.reduce((a, c) => a + c.total_abertas, 0)} caixas abertas` });

  // Imagem da primeira caixa com imagem configurada
  const caixaComImg = caixas.find(c => c.imagem_url);
  if (caixaComImg) embed.setImage(caixaComImg.imagem_url);

  // Select menu com as caixas disponíveis
  const options = caixas.map(c => ({
    label:       c.nome.slice(0, 100),
    description: `R$ ${c.preco.toFixed(2)} • ${getItensCaixa(c.id).length} itens possíveis`,
    value:       c.id,
    emoji:       '🎁',
  }));

  const rows = [];
  if (options.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('caixa_selecionar_canal')
        .setPlaceholder('🎁 Escolha uma caixa para abrir...')
        .addOptions(options),
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('historico_caixa').setLabel('📜 Meu Histórico').setStyle(ButtonStyle.Secondary),
  ));

  // Verificar se já tem embed no canal
  const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
  const existente = msgs?.find(m =>
    m.author.id === guild.client.user.id &&
    m.embeds.length > 0 &&
    m.embeds[0].title?.includes('Caixa')
  );

  if (existente) {
    await existente.edit({ embeds: [embed], components: rows }).catch(() => {});
  } else {
    await canal.send({ embeds: [embed], components: rows });
  }
}

// ─── Iniciar compra de uma caixa (igual ao carrinho — via ticket) ─────────────
async function iniciarCompraCaixa(interaction, caixaId, client) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada.' });

  const caixa = getCaixa(caixaId);
  if (!caixa || !caixa.ativa) return interaction.editReply({ content: '❌ Caixa não disponível.' });

  const itens = getItensCaixa(caixaId);
  const temEstoque = itens.some(i => i.estoque > 0);
  if (!temEstoque) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Caixa Esgotada')
        .setDescription('Esta caixa não tem itens disponíveis no momento.')
        .setTimestamp()],
    });
  }

  // Verificar se pode pagar com coins
  const coins      = usuario.coins || 0;
  const coinsNec   = Math.ceil(caixa.preco / 0.01);
  const podeCoins  = coins >= coinsNec;

  // Criar pedido pendente
  const pedidoId = uuidv4();
  db.prepare(`
    INSERT INTO pedidos (id, usuario_id, produto_id, quantidade, valor_unit, valor_total, desconto, metodo_pag, nota_fiscal, status)
    VALUES (?, ?, 'CAIXA', 1, ?, ?, 0, 'pix', ?, 'pendente')
  `).run(pedidoId, interaction.user.id, caixa.preco, caixa.preco, JSON.stringify({ tipo: 'caixa', caixaId }));

  // Abrir ticket igual ao carrinho
  const { abrirTicket } = require('./tickets');
  const memberObj = interaction.member
    || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);

  const { ok, canal } = await abrirTicket(interaction.guild, memberObj, 'compra', {
    pedidoId,
    produtoId: 'CAIXA',
    produto:   `🎁 ${caixa.nome}`,
    valor:     caixa.preco,
    usuarioId: interaction.user.id,
  });

  if (ok) db.prepare('UPDATE pedidos SET ticket_id=? WHERE id=?').run(canal.id, pedidoId);

  if (ok && canal) {
    await interaction.editReply({ content: `✅ Ticket aberto em ${canal}!\nEscolha o pagamento lá.` });
  } else {
    // Fallback sem ticket
    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gerar_pix_${pedidoId}`).setLabel('💠 Pagar via PIX').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`pagar_coins_${pedidoId}`).setLabel('🪙 Pagar com Coins').setStyle(ButtonStyle.Secondary).setDisabled(!podeCoins),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    );
    const embedFb = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🎁 ${caixa.nome}`)
      .setDescription(`💵 R$ ${caixa.preco.toFixed(2)}\n🪙 ${coinsNec.toLocaleString('pt-BR')} coins\n🆔 \`${pedidoId.slice(0,8).toUpperCase()}\``)
      .setTimestamp();
    await interaction.editReply({ embeds: [embedFb], components: [rowPag] });
  }

  log('compra', { usuario: interaction.user.id, produto: caixa.nome, valor: caixa.preco, pedidoId });
}

// ─── Entregar prêmio após pagamento confirmado ────────────────────────────────
async function entregarPrêmioCaixa(pedido, client) {
  try {
    const nota = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null;
    if (nota?.tipo !== 'caixa') return false;

    const caixaId = nota.caixaId;
    const caixa   = getCaixa(caixaId);
    if (!caixa) return false;

    const itemSorteado = sortearItem(caixaId);
    if (!itemSorteado) {
      console.error('[CaixaEntrega] Nenhum item disponível');
      return false;
    }

    const rar = RARIDADES[itemSorteado.raridade] || RARIDADES.comum;

    // Registrar histórico
    db.prepare('INSERT INTO caixa_historico (id,caixa_id,usuario_id,variante_id,raridade,pedido_id) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), caixaId, pedido.usuario_id, itemSorteado.variante_id, itemSorteado.raridade, pedido.id);

    // Pegar item do estoque
    const conteudo = pegarItemVariante(itemSorteado.variante_id, pedido.usuario_id, pedido.id);

    // Atualizar pedido
    db.prepare("UPDATE pedidos SET status='entregue', conteudo_entregue=?, entregue_em=strftime('%s','now') WHERE id=?")
      .run(conteudo || 'Prêmio entregue', pedido.id);

    db.prepare('UPDATE caixa_config SET total_abertas=total_abertas+1 WHERE id=?').run(caixaId);

    if (!client) return true;
    const guild  = client.guilds.cache.first();
    if (!guild) return true;

    const member = await guild.members.fetch(pedido.usuario_id).catch(() => null);
    if (!member) return true;

    // ── Animação de abertura ──────────────────────────────────────────────────
    const embedAnim = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎁 Abrindo sua Caixa...')
      .setDescription('✨ *Sorteando seu prêmio...*\n\n```\n⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜\n```')
      .setTimestamp();
    if (caixa.imagem_url) embedAnim.setThumbnail(caixa.imagem_url);

    const msgAnim = await member.send({ embeds: [embedAnim] }).catch(() => null);
    if (msgAnim) {
      const frames = ['🟨⬜⬜⬜⬜⬜⬜⬜⬜⬜','🟨🟨🟨⬜⬜⬜⬜⬜⬜⬜','🟨🟨🟨🟨🟨⬜⬜⬜⬜⬜','🟨🟨🟨🟨🟨🟨🟨🟨⬜⬜'];
      for (const f of frames) {
        await new Promise(r => setTimeout(r, 600));
        embedAnim.setDescription(`✨ *Sorteando...*\n\n\`\`\`\n${f}\n\`\`\``);
        await msgAnim.edit({ embeds: [embedAnim] }).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 800));

      // Resultado
      const embedRes = new EmbedBuilder()
        .setColor(rar.cor)
        .setTitle(`${rar.emoji} ${rar.label.toUpperCase()} — ${itemSorteado.variante_nome}`)
        .setDescription([
          `🎉 Parabéns, **${member.displayName}**!`,
          '',
          `Você abriu a **${caixa.nome}** e ganhou:`,
          `> ${rar.emoji} **${itemSorteado.variante_nome}** *(${rar.stars})*`,
          '',
          conteudo ? `📋 **Seu prêmio:**\n\`\`\`\n${conteudo}\n\`\`\`` : '📦 Prêmio sendo processado.',
        ].join('\n'))
        .addFields(
          { name: '📦 Produto',   value: itemSorteado.produto_nome,                 inline: true },
          { name: `${rar.emoji} Raridade`, value: rar.label,                       inline: true },
          { name: '🎲 Chance',    value: `${itemSorteado.chance}%`,                 inline: true },
          { name: '💵 Pago',      value: `R$ ${pedido.valor_total.toFixed(2)}`,     inline: true },
          { name: '🆔 Pedido',    value: `\`${pedido.id.slice(0,8).toUpperCase()}\``, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Caixa Misteriosa ❤️' });

      const rowConf = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirmar_entrega_${pedido.id}`).setLabel('✅ Confirmar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`avaliar_${pedido.id}`).setLabel('⭐ Avaliar').setStyle(ButtonStyle.Secondary),
      );

      await msgAnim.edit({ embeds: [embedRes], components: [rowConf] }).catch(() => {});
    }

    // Anunciar no canal da caixa (só raridade, sem spoiler)
    if (caixa.canal_id) {
      const canalCaixa = guild.channels.cache.get(caixa.canal_id);
      if (canalCaixa) {
        await canalCaixa.send({
          embeds: [new EmbedBuilder()
            .setColor(rar.cor)
            .setDescription(`${rar.emoji} **${member.displayName}** abriu a **${caixa.nome}** e encontrou algo **${rar.label}**! ${rar.stars}`)
            .setTimestamp()],
        }).catch(() => {});
      }
    }

    await log('caixa_aberta', {
      usuario:   pedido.usuario_id,
      produto:   `${itemSorteado.variante_nome} (${rar.label})`,
      valor:     pedido.valor_total,
      descricao: `Caixa ${caixa.nome}: ${member.user.tag} ganhou ${itemSorteado.variante_nome} [${rar.label}]`,
    });

    return true;
  } catch (err) {
    console.error('[EntregarCaixa]', err.message);
    return false;
  }
}

// ─── Histórico do usuário ─────────────────────────────────────────────────────
async function mostrarHistorico(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const hist = db.prepare(`
    SELECT ch.*, vp.nome as item_nome, cc.nome as caixa_nome
    FROM caixa_historico ch
    JOIN variantes_produto vp ON ch.variante_id=vp.id
    JOIN caixa_config cc ON ch.caixa_id=cc.id
    WHERE ch.usuario_id=? ORDER BY ch.aberta_em DESC LIMIT 10
  `).all(interaction.user.id);

  if (!hist.length) return interaction.editReply({ content: '📜 Você ainda não abriu nenhuma caixa.' });

  const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('📜 Histórico de Caixas').setTimestamp();
  for (const h of hist) {
    const rar  = RARIDADES[h.raridade] || RARIDADES.comum;
    const data = new Date(h.aberta_em * 1000).toLocaleDateString('pt-BR');
    embed.addFields({ name: `${rar.emoji} ${h.item_nome}`, value: `📦 ${h.caixa_nome} • ${rar.label} • ${data}`, inline: true });
  }
  return interaction.editReply({ embeds: [embed] });
}

module.exports = {
  listarCaixasAtivas, getCaixa, getItensCaixa, sortearItem,
  iniciarCompraCaixa, entregarPrêmioCaixa,
  enviarEmbedCaixasCanal, mostrarHistorico,
  RARIDADES,
};

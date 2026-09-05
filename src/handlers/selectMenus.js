const { mostrarProduto, iniciarCompra } = require('../systems/loja');
const { abrirCaixa } = require('../systems/caixaMisteriosa');
const { adicionarAoCarrinho } = require('../systems/carrinho');
const { Pedidos, Produtos, db } = require('../database/database');
const { isStaff } = require('../utils/permissions');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // ── Envio manual de produto (pa_*) ────────────────────────────────────────
  if (id === 'pa_select_produto_envio' || id.startsWith('pa_select_variante_envio_')) {
    const { handlePainelAdmin } = require('../systems/painelAdmin');
    return handlePainelAdmin(interaction, client);
  }

  // ── Remover plano do builder de carrinho ──────────────────────────────────
  if (id === 'cc_rem_plano_select') {
    const cc = require('../systems/criarCarrinhoSub');
    return cc.processarRemPlano(interaction);
  }

  // ── Seleção de idioma ─────────────────────────────────────────────────────
  if (id === 'selecionar_idioma') {
    const { setIdioma, IDIOMAS, t } = require('../systems/i18n');
    const idioma = interaction.values[0];
    setIdioma(interaction.user.id, idioma);
    const nome = IDIOMAS[idioma]?.nome || idioma;
    return interaction.reply({
      content: t('language_set', idioma, idioma),
      ephemeral: true,
    });
  }

  // ── Selects dos submenus admin ────────────────────────────────────────────
  if (id === 'ap_select_produto') {
    const sub = require('../systems/adminSubmenus');
    return sub.planoSelectProduto(interaction);
  }
  if (id === 'ae_select_variante') {
    const sub = require('../systems/adminSubmenus');
    return sub.estoqueSelectVariante(interaction);
  }
  // Selects da caixa misteriosa
  if (id === 'cxs_caixa') {
    const cx = require('../systems/caixaSubmenu');
    return cx.itemSelectCaixa(interaction);
  }
  if (id === 'cxs_variante') {
    const cx = require('../systems/caixaSubmenu');
    return cx.itemSelectVariante(interaction);
  }

  // ── Selecionar carrinho para editar ──────────────────────────────────────
  if (id === 'pa_select_editar_carrinho') {
    const { handlePainelAdmin } = require('../systems/painelAdmin');
    return handlePainelAdmin(interaction, client);
  }

  // ── Painel builder (remover plano) ────────────────────────────────────────
  if (id === 'pb_rem_plano_select') {
    const { handlePainelBuilder } = require('../systems/painelProduto');
    return handlePainelBuilder(interaction, client);
  }

  // ── Painéis de produto (select de variante) ───────────────────────────────
  if (id.startsWith('painel_selecionar_')) {
    const painelProdutoHandler = require('./painelProdutoHandler');
    return painelProdutoHandler(interaction, client);
  }

  // ── Selecionar moeda de pagamento ────────────────────────────────────────────
  if (id.startsWith('moeda_select_')) {
    const pedidoId = id.replace('moeda_select_', '');
    const moeda    = interaction.values[0]; // 'BRL' | 'USD' | 'EUR' | 'GBP' | 'CAD'

    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: `⚠️ Pedido já: **${pedido.status}**`, ephemeral: true });

    // BRL → PIX normal via EFI
    if (moeda === 'BRL') {
      const { gerarPixPedido } = require('../systems/loja');
      return gerarPixPedido(interaction, pedidoId, client);
    }

    // Outras moedas → Stripe Checkout
    await interaction.deferReply({ flags: 64 });
    try {
      const stripe  = require('../systems/stripe');
      const { MOEDAS } = stripe;
      const produto = Produtos.get(pedido.produto_id);

      const checkout = await stripe.criarCheckout({
        valorBrl:  pedido.valor_total,
        descricao: `Máximo Store — ${produto?.nome || 'Produto'}`,
        pedidoId,
        moeda,
      });

      db.prepare("UPDATE pedidos SET tx_id=?, metodo_pag=? WHERE id=?")
        .run(`ST_${checkout.sessionId}`, `stripe_${moeda.toLowerCase()}`, pedidoId);

      const info = MOEDAS[moeda];
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

      const rowPag = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(`💳 Pagar ${info.simbolo}${checkout.valorMoeda} (${moeda})`)
          .setStyle(ButtonStyle.Link)
          .setURL(checkout.linkPagar),
        new ButtonBuilder()
          .setCustomId(`verificar_stripe_${pedidoId}`)
          .setLabel('🔄 Verificar Pagamento')
          .setStyle(ButtonStyle.Primary),
      );

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x635BFF)
          .setTitle(`💳 Pagamento em ${info.nome} (${moeda})`)
          .setDescription([
            `> Clique no botão abaixo para pagar com cartão de crédito.`,
            `> Após o pagamento, clique em **🔄 Verificar Pagamento**.`,
          ].join('\n'))
          .addFields(
            { name: `${info.emoji} Valor ${moeda}`, value: `**${info.simbolo}${checkout.valorMoeda}**`, inline: true },
            { name: '🇧🇷 Valor BRL',                 value: `R$ ${Number(pedido.valor_total).toFixed(2)}`, inline: true },
            { name: '⚙️ Processado por',              value: '**Stripe** • Seguro e criptografado', inline: true },
          )
          .setTimestamp()
          .setFooter({ text: 'Máximo Store • Pagamento seguro via Stripe' })],
        components: [rowPag],
      });
    } catch (err) {
      console.error('[Stripe Checkout]', err.message);
      return interaction.editReply({ content: `❌ Erro ao gerar checkout: \`${err.message.slice(0, 100)}\`` });
    }
  }

  // ── Selecionar produto da loja ────────────────────────────────────────────
  if (id === 'loja_selecionar_produto') {
    const produtoId = interaction.values[0];
    return mostrarProduto(interaction, produtoId);
  }

  // ── Selecionar caixa misteriosa (novo sistema) ───────────────────────────
  if (id === 'caixa_selecionar_canal' || id === 'caixa_selecionar') {
    const caixaId = interaction.values[0];
    // Defer imediato para não expirar
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
    const { iniciarCompraCaixa } = require('../systems/caixaMisteriosa');
    return iniciarCompraCaixa(interaction, caixaId, client);
  }
};

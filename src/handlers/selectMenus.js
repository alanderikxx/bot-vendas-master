const { mostrarProduto, iniciarCompra } = require('../systems/loja');
const { abrirCaixa } = require('../systems/caixaMisteriosa');
const { adicionarAoCarrinho } = require('../systems/carrinho');
const { Pedidos, Produtos, db } = require('../database/database');
const { isStaff } = require('../utils/permissions');

// ─── Formatar dados bancários de transferência ────────────────────────────────
function dadosBancarios(dados, moeda) {
  if (!dados) return '> ⚠️ Dados bancários indisponíveis. Tente novamente.';
  const linhas = [];
  if (dados.financial_addresses?.length) {
    for (const addr of dados.financial_addresses) {
      if (addr.type === 'iban') {
        linhas.push(`🏦 **IBAN:** \`${addr.iban?.iban}\``);
        linhas.push(`🏛️ **BIC/SWIFT:** \`${addr.iban?.bic}\``);
        linhas.push(`🏢 **Banco:** ${addr.iban?.bank_name || 'Stripe'}`);
      } else if (addr.type === 'sort_code') {
        linhas.push(`🏦 **Sort Code:** \`${addr.sort_code?.sort_code}\``);
        linhas.push(`💳 **Nº Conta:** \`${addr.sort_code?.account_number}\``);
      } else if (addr.type === 'zengin') {
        linhas.push(`🏦 **Banco:** ${addr.zengin?.bank_name}`);
        linhas.push(`🔢 **Agência:** \`${addr.zengin?.branch_code}\``);
        linhas.push(`💳 **Conta:** \`${addr.zengin?.account_number}\``);
      } else if (addr.type === 'aba') {
        linhas.push(`🏦 **Routing (ABA):** \`${addr.aba?.routing_number}\``);
        linhas.push(`💳 **Account Number:** \`${addr.aba?.account_number}\``);
        linhas.push(`🏢 **Banco:** ${addr.aba?.bank_name || 'Stripe'}`);
      }
    }
  }
  if (dados.reference) linhas.push(`🔖 **Referência:** \`${dados.reference}\``);
  if (dados.note)      linhas.push(`> ⚠️ ${dados.note}`);
  return linhas.length ? linhas.join('\n') : '> Dados bancários gerados. Verifique no Stripe Dashboard.';
}

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
    const moeda    = interaction.values[0];

    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: `⚠️ Pedido já: **${pedido.status}**`, ephemeral: true });

    // BRL → PIX normal via EFI
    if (moeda === 'BRL') {
      const { gerarPixPedido } = require('../systems/loja');
      return gerarPixPedido(interaction, pedidoId, client);
    }

    // Outras moedas → mostrar select de método se tiver mais de 1 opção
    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
    const { MOEDAS, METODOS_POR_MOEDA, GRUPOS_METODO } = require('../systems/stripe');
    const info    = MOEDAS[moeda];
    const metodos = METODOS_POR_MOEDA[moeda] || ['card'];

    // Se só tem cartão, vai direto pro checkout sem mostrar select
    if (metodos.length === 1 && metodos[0] === 'card') {
      await interaction.deferReply({ flags: 64 });
      try {
        const stripe  = require('../systems/stripe');
        const produto = Produtos.get(pedido.produto_id);
        const checkout = await stripe.criarCheckout({
          valorBrl:  pedido.valor_total,
          descricao: `Máximo Store — ${produto?.nome || 'Produto'}`,
          pedidoId,
          moeda,
          metodo:    null, // automático
        });
        db.prepare("UPDATE pedidos SET tx_id=?, metodo_pag=? WHERE id=?")
          .run(`ST_${checkout.sessionId}`, `stripe_${moeda.toLowerCase()}`, pedidoId);
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        const rowPag = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel(`💳 Pagar ${info.simbolo}${checkout.valorMoeda} (${moeda})`).setStyle(ButtonStyle.Link).setURL(checkout.linkPagar),
          new ButtonBuilder().setCustomId(`verificar_stripe_${pedidoId}`).setLabel('🔄 Verificar').setStyle(ButtonStyle.Primary),
        );
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x635BFF)
            .setTitle(`${info.emoji} Pagamento em ${info.nome} (${moeda})`)
            .setDescription('> Clique abaixo para pagar. Apple Pay e Google Pay disponíveis na página.')
            .addFields(
              { name: `${info.emoji} Valor`, value: `**${info.simbolo}${checkout.valorMoeda}**`, inline: true },
              { name: '🇧🇷 Valor BRL',        value: `R$ ${Number(pedido.valor_total).toFixed(2)}`, inline: true },
            )
            .setTimestamp()
            .setFooter({ text: 'Máximo Store • Stripe' })],
          components: [rowPag],
        });
      } catch (err) {
        console.error('[Stripe Checkout]', err.message);
        return interaction.editReply({ content: `❌ Erro: \`${err.message.slice(0, 100)}\`` });
      }
    }

    // Sempre inclui "automático" como primeira opção
    const opcoes = [
      new StringSelectMenuOptionBuilder()
        .setValue('auto')
        .setLabel('⚡ Automático (recomendado)')
        .setDescription('Stripe escolhe os melhores métodos para você'),
    ];

    for (const m of metodos) {
      const g = GRUPOS_METODO[m];
      if (!g) continue;
      opcoes.push(
        new StringSelectMenuOptionBuilder()
          .setValue(m)
          .setLabel(g.label)
          .setDescription(`Pagar em ${info.simbolo} (${moeda})`),
      );
    }

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`metodo_select_${moeda}_${pedidoId}`)
        .setPlaceholder('Escolha o método de pagamento...')
        .addOptions(opcoes.slice(0, 25)),
    );

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0x635BFF)
        .setTitle(`${info.emoji} Método de Pagamento — ${info.nome} (${moeda})`)
        .setDescription([
          `> Escolha como deseja pagar em **${info.nome}**.`,
          `> **Automático** mostra todos os métodos disponíveis na página de pagamento.`,
          '',
          `💵 **Valor BRL:** R$ ${Number(pedido.valor_total).toFixed(2)}`,
        ].join('\n'))
        .setFooter({ text: 'Máximo Store • Stripe' })],
      components: [selectRow],
    });
  }

  // ── Selecionar método de pagamento (após moeda) ───────────────────────────
  if (id.startsWith('metodo_select_')) {
    const partes   = id.replace('metodo_select_', '').split('_');
    const moeda    = partes[0];
    const pedidoId = partes.slice(1).join('_');
    const metodo   = interaction.values[0]; // 'auto' | 'card' | 'boleto' | etc.

    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: `⚠️ Pedido já: **${pedido.status}**`, ephemeral: true });

    await interaction.deferReply({ flags: 64 });
    try {
      const stripe  = require('../systems/stripe');
      const { MOEDAS, GRUPOS_METODO, criarTransferenciaBancaria } = stripe;
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
      const info    = MOEDAS[moeda];
      const produto = Produtos.get(pedido.produto_id);

      // ── Bank Transfer — conta virtual ACH/SEPA ─────────────────────────
      if (metodo === 'bank_transfer') {
        const usuario = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(pedido.usuario_id);
        const transf  = await criarTransferenciaBancaria({
          valorBrl:    pedido.valor_total,
          descricao:   `Máximo Store — ${produto?.nome || 'Produto'}`,
          pedidoId,
          moeda,
          nomeCliente: usuario?.nome || interaction.user.username,
        });

        db.prepare("UPDATE pedidos SET tx_id=?, metodo_pag=? WHERE id=?")
          .run(`BT_${transf.paymentIntentId}`, `bank_transfer_${moeda.toLowerCase()}`, pedidoId);

        const infosBanc = dadosBancarios(transf.dadosBancarios, moeda);

        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x1A73E8)
            .setTitle(`🏦 Transferência Bancária — ${info.nome} (${moeda})`)
            .setDescription([
              `> Transfira para a conta virtual abaixo. O Stripe identifica automaticamente.`,
              '',
              infosBanc,
            ].join('\n'))
            .addFields(
              { name: `${info.emoji} Valor`, value: `**${info.simbolo}${transf.valorMoeda}**`,          inline: true },
              { name: '🇧🇷 Valor BRL',        value: `R$ ${Number(pedido.valor_total).toFixed(2)}`,      inline: true },
            )
            .setTimestamp()
            .setFooter({ text: 'Máximo Store • Stripe Bank Transfer — válido por 7 dias' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`verificar_stripe_${pedidoId}`).setLabel('🔄 Verificar Pagamento').setStyle(ButtonStyle.Primary),
          )],
        });
      }

      // ── Checkout normal (cartão, boleto, etc.) ─────────────────────────
      const checkout = await stripe.criarCheckout({
        valorBrl:  pedido.valor_total,
        descricao: `Máximo Store — ${produto?.nome || 'Produto'}`,
        pedidoId,
        moeda,
        metodo:    (metodo === 'auto' || metodo === 'card') ? null : metodo,
      });

      db.prepare("UPDATE pedidos SET tx_id=?, metodo_pag=? WHERE id=?")
        .run(`ST_${checkout.sessionId}`, `stripe_${moeda.toLowerCase()}_${metodo}`, pedidoId);

      const metodoInfo  = GRUPOS_METODO[metodo] || { label: 'Automático', emoji: '⚡' };
      const metodoLabel = metodo === 'auto' ? '⚡ Automático' : metodoInfo.label;

      const rowPag = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(`${metodoInfo.emoji || '💳'} Pagar ${info.simbolo}${checkout.valorMoeda}`)
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
          .setTitle(`${info.emoji} Pagamento em ${info.nome} (${moeda})`)
          .setDescription([
            `> Clique no botão abaixo para concluir o pagamento.`,
            `> Após pagar, clique em **🔄 Verificar Pagamento**.`,
          ].join('\n'))
          .addFields(
            { name: `${info.emoji} Valor`,    value: `**${info.simbolo}${checkout.valorMoeda}**`,           inline: true },
            { name: '🇧🇷 Valor BRL',           value: `R$ ${Number(pedido.valor_total).toFixed(2)}`,         inline: true },
            { name: '💳 Método',               value: metodoLabel,                                           inline: true },
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

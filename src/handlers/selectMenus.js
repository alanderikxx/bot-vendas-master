const { mostrarProduto, iniciarCompra } = require('../systems/loja');
const { abrirCaixa } = require('../systems/caixaMisteriosa');
const { adicionarAoCarrinho } = require('../systems/carrinho');
const { Pedidos, Produtos, db } = require('../database/database');
const { isStaff } = require('../utils/permissions');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

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

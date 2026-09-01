/**
 * Handler para interações dos painéis de produto
 * Botões: painel_comprar_var_{varId}
 * Select: painel_selecionar_{painelId}
 */
const { iniciarCompraVariante } = require('../systems/loja');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // Fazer defer imediatamente para não expirar (timeout de 3s do Discord)
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch (e) {
    console.error('[PainelProduto] Erro no defer:', e.message);
  }

  // ── Select: usuário escolheu um plano ────────────────────────────────────
  if (id.startsWith('painel_selecionar_')) {
    const varianteId = interaction.values[0];
    return iniciarCompraVariante(interaction, varianteId, client);
  }

  // ── Botão: compra direta ──────────────────────────────────────────────────
  if (id.startsWith('painel_comprar_var_')) {
    const varianteId = id.replace('painel_comprar_var_', '');
    return iniciarCompraVariante(interaction, varianteId, client);
  }
};

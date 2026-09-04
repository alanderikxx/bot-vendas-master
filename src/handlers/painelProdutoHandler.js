/**
 * Handler para interações dos painéis de produto
 * Botões: painel_comprar_var_{varId}
 * Select: painel_selecionar_{painelId}
 */
const { iniciarCompraVariante } = require('../systems/loja');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { db } = require('../database/database');
const config = require('../config');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch (e) {
    console.error('[PainelProduto] Erro no defer:', e.message);
  }

  // ── Select: usuário escolheu um plano — mostrar confirmação ─────────────
  if (id.startsWith('painel_selecionar_')) {
    const varianteId = interaction.values[0];
    const variante   = db.prepare('SELECT * FROM variantes_produto WHERE id=? AND ativo=1').get(varianteId);
    if (!variante) return interaction.editReply({ content: '❌ Plano não encontrado.' });

    const produto  = db.prepare('SELECT * FROM produtos WHERE id=?').get(variante.produto_id);
    const qtd      = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId)?.c || 0;
    const cashback = Math.floor(Number(variante.preco) * 5); // 5 coins por real

    // Verificar estoque
    if (qtd === 0) {
      const rowNotif = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`notif_estoque_${varianteId}`).setLabel('🔔 Avisar quando voltar').setStyle(ButtonStyle.Secondary),
      );
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Sem Estoque')
          .setDescription([
            `> O plano **${variante.nome}** está sem estoque no momento.`,
            `> Clique em **🔔 Avisar quando voltar** para ser notificado.`,
          ].join('\n'))
          .setTimestamp()],
        components: [rowNotif],
      });
    }

    // Embed de confirmação
    const imagemUrl = produto?.imagem_url || db.prepare('SELECT imagem_url FROM paineis_canal WHERE produto_id=? AND ativo=1 LIMIT 1').get(variante.produto_id)?.imagem_url;

    const embedConfirm = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🛒 Confirmar Compra')
      .setDescription([
        `> Você está prestes a comprar o plano abaixo.`,
        `> Clique em **✅ Confirmar** para abrir o ticket e escolher o pagamento.`,
      ].join('\n'))
      .addFields(
        { name: '📦 Produto',    value: `**${produto?.nome || '—'}**`,              inline: true },
        { name: '🏷️ Plano',     value: `**${variante.nome}**`,                      inline: true },
        { name: '💵 Preço',      value: `**R$ ${Number(variante.preco).toFixed(2)}**`, inline: true },
        { name: '📊 Estoque',    value: `${qtd} unidade(s) disponível`,              inline: true },
        { name: '🎁 Cashback',   value: `+**${cashback} coins** (5% sem cupom)`,     inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Confirme para prosseguir' });

    if (imagemUrl) embedConfirm.setThumbnail(imagemUrl);

    const rowConfirm = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirmar_compra_var_${varianteId}`).setLabel('✅ Confirmar Compra').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancelar_confirmacao`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({ embeds: [embedConfirm], components: [rowConfirm] });
  }

  // ── Botão: confirmar compra após confirmação ──────────────────────────────
  if (id.startsWith('confirmar_compra_var_')) {
    const varianteId = id.replace('confirmar_compra_var_', '');
    return iniciarCompraVariante(interaction, varianteId, client);
  }

  // ── Botão: cancelar confirmação ───────────────────────────────────────────
  if (id === 'cancelar_confirmacao') {
    return interaction.editReply({ content: '❌ Compra cancelada.', embeds: [], components: [] });
  }

  // ── Botão: compra direta (legado) ──────────────────────────────────────────
  if (id.startsWith('painel_comprar_var_')) {
    const varianteId = id.replace('painel_comprar_var_', '');
    return iniciarCompraVariante(interaction, varianteId, client);
  }
};

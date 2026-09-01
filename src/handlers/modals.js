const { Pedidos, Produtos, Usuarios, db } = require('../database/database');
const { solicitarReembolso } = require('../systems/reembolsos');
const { iniciarCompra } = require('../systems/loja');
const { handlePainelModals } = require('../systems/painelProduto');
const { handlePainelAdminModals } = require('../systems/painelAdmin');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // ── Modais do painel admin central (pam_*) ────────────────────────────────
  if (id.startsWith('pam_')) {
    return handlePainelAdminModals(interaction, client);
  }

  // ── Modal resgate código de coins ─────────────────────────────────────────
  if (id === 'modal_resgatar_codigo') {
    const codigo = interaction.fields.getTextInputValue('codigo');
    const { resgatarCodigo } = require('../systems/codigosCoins');
    return resgatarCodigo(interaction, codigo);
  }

  // ── Modal código de convite ───────────────────────────────────────────────
  if (id === 'modal_usar_codigo_convite') {
    const codigo = interaction.fields.getTextInputValue('codigo');
    const { resgatarCodigoConvite } = require('../systems/sistemaConvite');
    return resgatarCodigoConvite(interaction, codigo);
  }

  // ── Modais do painel builder (pbm_*) ──────────────────────────────────────
  if (id.startsWith('pbm_')) {
    return handlePainelModals(interaction);
  }

  // ── Modal de reembolso ────────────────────────────────────────────────────
  if (id.startsWith('modal_reembolso_')) {
    const pedidoId = id.replace('modal_reembolso_', '');
    const motivo = interaction.fields.getTextInputValue('motivo');
    await interaction.deferReply({ ephemeral: true });
    await solicitarReembolso(interaction, pedidoId, motivo);
  }

  // ── Modal de avaliação ────────────────────────────────────────────────────
  else if (id.startsWith('modal_avaliacao_')) {
    const pedidoId = id.replace('modal_avaliacao_', '');
    const notaStr = interaction.fields.getTextInputValue('nota').trim();
    const comentario = interaction.fields.getTextInputValue('comentario') || '';

    const nota = parseInt(notaStr);
    if (isNaN(nota) || nota < 1 || nota > 5) {
      return interaction.reply({ content: '❌ Nota inválida. Digite um número de 1 a 5.', ephemeral: true });
    }

    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.usuario_id !== interaction.user.id) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    // Verificar se já avaliou
    const jaAvaliou = db.prepare('SELECT 1 FROM avaliacoes WHERE pedido_id=? AND usuario_id=?').get(pedidoId, interaction.user.id);
    if (jaAvaliou) return interaction.reply({ content: '⚠️ Você já avaliou este produto.', ephemeral: true });

    // Inserir avaliação
    db.prepare('INSERT INTO avaliacoes (id, produto_id, usuario_id, pedido_id, nota, comentario) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), pedido.produto_id, interaction.user.id, pedidoId, nota, comentario);

    // Atualizar média do produto
    const avals = db.prepare('SELECT AVG(nota) as media, COUNT(*) as total FROM avaliacoes WHERE produto_id=?').get(pedido.produto_id);
    db.prepare('UPDATE produtos SET avaliacao=?, total_aval=? WHERE id=?').run(avals.media, avals.total, pedido.produto_id);

    const produto = Produtos.get(pedido.produto_id);
    await interaction.reply({
      content: `✅ Avaliação registrada! ${'⭐'.repeat(nota)} para **${produto?.nome}**. Obrigado!`,
      ephemeral: true,
    });
  }

  // ── Modal de compra com cupom ─────────────────────────────────────────────
  else if (id.startsWith('modal_cupom_')) {
    const produtoId = id.replace('modal_cupom_', '');
    const cupom = interaction.fields.getTextInputValue('cupom').trim();
    await iniciarCompra(interaction, produtoId, cupom || null);
  }

  // ── Modal Boleto ──────────────────────────────────────────────────────────
  else if (id.startsWith('modal_boleto_')) {
    const produtoId = id.replace('modal_boleto_', '');
    const { processarCompraBoleto } = require('../systems/loja');
    await processarCompraBoleto(interaction, produtoId, {
      nome:     interaction.fields.getTextInputValue('nome'),
      cpf:      interaction.fields.getTextInputValue('cpf'),
      email:    interaction.fields.getTextInputValue('email'),
    });
  }

  // ── Modal de fechar ticket com motivo ─────────────────────────────────────
  else if (id === 'modal_fechar_ticket') {
    const motivo = interaction.fields.getTextInputValue('motivo');
    const { fecharTicket } = require('../systems/tickets');
    await fecharTicket(interaction, motivo);
  }

  // ── Modal Flash Sale (pelo painel) ────────────────────────────────────────
  else if (id === 'modal_flashsale') {
    if (!require('../utils/permissions').isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    const produtoId = interaction.fields.getTextInputValue('produto_id').trim();
    const desconto  = parseInt(interaction.fields.getTextInputValue('desconto'));
    const duracao   = parseInt(interaction.fields.getTextInputValue('duracao'));

    if (isNaN(desconto) || isNaN(duracao)) {
      return interaction.reply({ content: '❌ Desconto e duração precisam ser números.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const { iniciarFlashSale } = require('../systems/flashsale');
    const { ok, erro, precoPromo, expira } = await iniciarFlashSale({
      produtoId, desconto, duracaoMin: duracao,
      guild: interaction.guild, executorId: interaction.user.id,
    });

    if (!ok) return interaction.editReply({ content: `❌ ${erro}` });
    return interaction.editReply({
      content: `⚡ **Flash Sale iniciada!** Novo preço: R$ ${precoPromo.toFixed(2)} (${desconto}% OFF) — Encerra <t:${Math.floor(expira/1000)}:R>`,
    });
  }

  // ── Modal rejeitar reembolso pelo painel ──────────────────────────────────
  else if (id.startsWith('modal_rej_reimb_')) {
    const reembolsoId = id.replace('modal_rej_reimb_', '');
    const motivo = interaction.fields.getTextInputValue('motivo');
    const { rejeitarReembolso } = require('../systems/reembolsos');
    return rejeitarReembolso(interaction, reembolsoId, motivo);
  }
};

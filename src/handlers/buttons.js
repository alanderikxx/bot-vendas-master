const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { mostrarProduto, iniciarCompra, entregarProduto } = require('../systems/loja');
const { fecharTicket, assumirTicket, gerarTranscript } = require('../systems/tickets');
const { adicionarAoCarrinho, removerDoCarrinho, limparCarrinho, mostrarCarrinho, listarCarrinho, calcularTotal } = require('../systems/carrinho');
const { abrirCaixa, menuCaixas, historicoCaixas } = require('../systems/caixaMisteriosa');
const { solicitarReembolso } = require('../systems/reembolsos');
const { painelAfiliado, solicitarSaque } = require('../systems/afiliados');
const { Pedidos, Produtos, Usuarios, db } = require('../database/database');
const { isStaff } = require('../utils/permissions');
const { Embeds } = require('../utils/embeds');
const efi = require('../systems/efi');
const { log } = require('../utils/logger');
const painelButtons = require('./painelButtons');

const painelProdutoHandler = require('./painelProdutoHandler');
const { handlePainelBuilder, handlePainelModals } = require('../systems/painelProduto');
const { handlePainelAdmin } = require('../systems/painelAdmin');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // ── Abrir caixa misteriosa ────────────────────────────────────────────────────
  if (id === 'abrir_caixa_misteriosa') {
    const { abrirCaixa } = require('../systems/caixaMisteriosa');
    return abrirCaixa(interaction, client);
  }

  // ── Histórico da caixa ────────────────────────────────────────────────────────
  if (id === 'historico_caixa') {
    const { mostrarHistorico } = require('../systems/caixaMisteriosa');
    return mostrarHistorico(interaction);
  }

  // ── Verificar pagamento da caixa ──────────────────────────────────────────────
  if (id.startsWith('caixa_verificar_')) {
    const pedidoId = id.replace('caixa_verificar_', '');
    const { verificarPagamentoCaixa } = require('../systems/caixaMisteriosa');
    return verificarPagamentoCaixa(interaction, pedidoId, client);
  }

  // ── Sistema de convites ───────────────────────────────────────────────────────
  if (id === 'convite_criar_codigo') {
    const { mostrarMeuCodigo } = require('../systems/sistemaConvite');
    return mostrarMeuCodigo(interaction);
  }

  if (id === 'convite_usar_codigo') {
    const modal = new ModalBuilder().setCustomId('modal_usar_codigo_convite').setTitle('🎁 Usar Código de Convite');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo')
          .setLabel('Digite o código de convite')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: ALAN-AB12')
          .setMinLength(9)
          .setMaxLength(9),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Seletor de idioma ────────────────────────────────────────────────────────
  if (id === 'abrir_idioma') {
    const { mostrarSeletorIdioma } = require('../systems/i18n');
    return mostrarSeletorIdioma(interaction);
  }

  // ── Painel admin central (pa_*) ──────────────────────────────────────────
  if (id.startsWith('pa_')) {
    return handlePainelAdmin(interaction, client);
  }

  // ── Submenu criar/editar carrinho (cc_*) ─────────────────────────────────
  if (id.startsWith('cc_')) {
    return handlePainelAdmin(interaction, client);
  }

  // ── Resgate de códigos de coins ───────────────────────────────────────────
  if (id === 'resgatar_codigo_coins') {
    const modal = new (require('discord.js').ModalBuilder)()
      .setCustomId('modal_resgatar_codigo')
      .setTitle('🎫 Resgatar Código de Coins');
    modal.addComponents(
      new (require('discord.js').ActionRowBuilder)().addComponents(
        new (require('discord.js').TextInputBuilder)()
          .setCustomId('codigo')
          .setLabel('Digite seu código')
          .setStyle(require('discord.js').TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: ABCD-EFGH-IJKL')
          .setMinLength(14)
          .setMaxLength(14),
      ),
    );
    return interaction.showModal(modal);
  }

  if (id === 'ver_saldo_coins') {
    const { Usuarios } = require('../database/database');
    const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
    const coins   = usuario.coins || 0;
    const { COIN_EMOJI } = require('../systems/coins');
    const config_ = require('../config');
    return interaction.reply({
      embeds: [new (require('discord.js').EmbedBuilder)()
        .setColor(config_.colors.coins || config_.colors.gold)
        .setTitle(`${COIN_EMOJI} Seu Saldo de Coins`)
        .addFields(
          { name: `${COIN_EMOJI} Coins`, value: `**${coins.toLocaleString('pt-BR')}**`, inline: true },
          { name: '💵 Valor',            value: `**R$ ${(coins * 0.01).toFixed(2)}**`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • 100 coins = R$ 1,00' })],
      ephemeral: true,
    });
  }

  // ── Painel builder construtor (pb_*) ─────────────────────────────────────
  if (id.startsWith('pb_')) {
    return handlePainelBuilder(interaction, client);
  }

  // ── Painéis de produto publicados (compra/select) ────────────────────────
  if (id.startsWith('painel_selecionar_') || id.startsWith('painel_comprar_var_')) {
    return painelProdutoHandler(interaction, client);
  }

  // ── Painel admin antigo (painel_*) ───────────────────────────────────────
  if (id.startsWith('painel_')) {
    return painelButtons(interaction, client);
  }

  // ── Loja ────────────────────────────────────────────────────────────────────
  if (id === 'loja_abrir') return mostrarLoja(interaction);
  if (id === 'loja_voltar') return mostrarLoja(interaction);
  if (id.startsWith('loja_pagina_')) {
    const pagina = parseInt(id.replace('loja_pagina_', ''));
    const { mostrarLoja } = require('../systems/loja');
    return mostrarLoja(interaction, pagina);
  }

  // ── Gerar PIX ao clicar no botão ────────────────────────────────────────────
  if (id.startsWith('gerar_pix_')) {
    const pedidoId = id.replace('gerar_pix_', '');
    const { gerarPixPedido } = require('../systems/loja');
    return gerarPixPedido(interaction, pedidoId, client);
  }

  // ── Pagar com coins ──────────────────────────────────────────────────────────
  if (id.startsWith('pagar_coins_')) {
    const pedidoId = id.replace('pagar_coins_', '');
    const { pagarComCoins } = require('../systems/loja');
    return pagarComCoins(interaction, pedidoId, client);
  }

  // ── Liberar sem pagamento (cargo aceitar compra) ─────────────────────────────
  if (id.startsWith('ticket_aceitar_sem_pag_')) {
    const pedidoId = id.replace('ticket_aceitar_sem_pag_', '');
    const { podeAceitarCompra } = require('../utils/permissions');
    if (!podeAceitarCompra(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas quem tem o cargo **Aceitar Compra** pode liberar.', ephemeral: true });
    }
    const { liberarPedidoManual } = require('../systems/loja');
    return liberarPedidoManual(interaction, pedidoId, client);
  }

  // ── Boleto ───────────────────────────────────────────────────────────────────
  if (id.startsWith('comprar_boleto_')) {
    const produtoId = id.replace('comprar_boleto_', '');
    const { iniciarCompraBoleto } = require('../systems/loja');
    return iniciarCompraBoleto(interaction, produtoId);
  }

  // ── Comprar direto PIX ───────────────────────────────────────────────────────
  if (id.startsWith('comprar_')) {
    const produtoId = id.replace('comprar_', '');
    return iniciarCompra(interaction, produtoId);
  }

  // ── Verificar PIX ────────────────────────────────────────────────────────────
  if (id.startsWith('verificar_pix_')) {
    const pedidoId = id.replace('verificar_pix_', '');
    await interaction.deferReply({ ephemeral: true });
    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
    if (pedido.status !== 'pendente') return interaction.editReply({ content: `✅ Pedido já está como: **${pedido.status}**` });

    if (pedido.tx_id && !pedido.tx_id.startsWith('SIM_')) {
      try {
        const status = await efi.consultarCobranca(pedido.tx_id);
        if (status.pago) {
          await entregarProduto(pedido, client);
          return interaction.editReply({ content: '✅ Pagamento confirmado! Produto entregue.' });
        } else {
          return interaction.editReply({ content: '⏳ Pagamento ainda não identificado. Aguarde alguns segundos e tente novamente.' });
        }
      } catch (e) {
        return interaction.editReply({ content: '❌ Erro ao verificar pagamento. Tente novamente.' });
      }
    } else {
      return interaction.editReply({ content: '⏳ Verificação automática ativa. Seu produto será entregue assim que o pagamento for confirmado.' });
    }
  }

  // ── Aplicar cupom no pedido ───────────────────────────────────────────────────
  if (id.startsWith('aplicar_cupom_')) {
    const pedidoId = id.replace('aplicar_cupom_', '');
    const pedido   = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Este pedido não é seu.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não está mais pendente.', ephemeral: true });
    if (pedido.cupom_usado) return interaction.reply({ content: `⚠️ Cupom **${pedido.cupom_usado}** já aplicado neste pedido.`, ephemeral: true });

    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const modal = new ModalBuilder()
      .setCustomId(`modal_cupom_${pedidoId}`)
      .setTitle('🎟️ Aplicar Cupom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo')
          .setLabel('Código do cupom')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: PROMO10'),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Alterar quantidade do pedido ─────────────────────────────────────────────
  if (id.startsWith('alterar_qtd_')) {
    const pedidoId = id.replace('alterar_qtd_', '');
    const pedido   = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Este pedido não é seu.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não está mais pendente.', ephemeral: true });

    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const modal = new ModalBuilder()
      .setCustomId(`modal_alterar_qtd_${pedidoId}`)
      .setTitle('🔢 Alterar Quantidade');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantidade')
          .setLabel('Nova quantidade (mínimo 1)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(3)
          .setPlaceholder('Ex: 2'),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Cancelar pedido ──────────────────────────────────────────────────────────
  if (id.startsWith('cancelar_pedido_') || id.startsWith('cancelar_pix_')) {
    const pedidoId = id.replace('cancelar_pedido_', '').replace('cancelar_pix_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id && !isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Este pedido não pode ser cancelado.', ephemeral: true });

    Pedidos.atualizar(pedidoId, {
      status: 'cancelado',
      cancelado_por: interaction.user.id,
      motivo_cancel: 'Cancelado pelo usuário',
      cancelado_em: Math.floor(Date.now() / 1000),
    });

    // Fechar o ticket se existir
    if (pedido.ticket_id) {
      const { fecharTicket } = require('../systems/tickets');
      const { Tickets } = require('../database/database');
      const ticket = Tickets.get(pedido.ticket_id);
      if (ticket && ticket.status === 'aberto') {
        // Simular um interaction de fechamento via canal
        const canalTicket = interaction.guild?.channels.cache.get(pedido.ticket_id);
        if (canalTicket) {
          await canalTicket.send({
            embeds: [new (require('discord.js').EmbedBuilder)()
              .setColor(0x2C2F33)
              .setTitle('🔒 Pedido Cancelado')
              .setDescription(`Pedido cancelado por <@${interaction.user.id}>.\nEste ticket será encerrado.`)
              .setTimestamp()],
          });
          // Atualizar banco e deletar canal
          Tickets.atualizar(pedido.ticket_id, {
            status: 'fechado',
            fechado_por: interaction.user.id,
            motivo: 'Pedido cancelado',
            fechado_em: Math.floor(Date.now() / 1000),
          });
          setTimeout(() => canalTicket.delete().catch(() => {}), 5000);
        }
      }
    }

    return interaction.reply({ content: '✅ Pedido cancelado.', ephemeral: true });
  }

  // ── Confirmar entrega → fecha ticket ─────────────────────────────────────────
  if (id.startsWith('confirmar_entrega_')) {
    const pedidoId = id.replace('confirmar_entrega_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    if (pedido.status === 'entregue') return interaction.reply({ content: '✅ Entrega já confirmada!', ephemeral: true });

    Pedidos.atualizar(pedidoId, { status: 'entregue', entregue_em: Math.floor(Date.now()/1000) });

    await interaction.reply({ content: '✅ Recebimento confirmado! Obrigado pela compra. 🎉', ephemeral: true });

    // Fechar ticket automaticamente se existir
    if (pedido.ticket_id) {
      const { Tickets } = require('../database/database');
      const ticket = Tickets.get(pedido.ticket_id);
      if (ticket && ticket.status === 'aberto') {
        Tickets.atualizar(pedido.ticket_id, {
          status:     'fechado',
          fechado_por: interaction.user.id,
          motivo:     'Entrega confirmada pelo comprador',
          fechado_em: Math.floor(Date.now() / 1000),
        });
        const canalTicket = interaction.guild?.channels.cache.get(pedido.ticket_id);
        if (canalTicket) {
          await canalTicket.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.success)
              .setTitle('✅ Entrega Confirmada')
              .setDescription(`<@${interaction.user.id}> confirmou o recebimento do produto.\nTicket encerrado automaticamente.`)
              .setTimestamp()],
          }).catch(() => {});
          setTimeout(() => canalTicket.delete().catch(() => {}), 5000);
        }
      }
    }
    return;
  }

  // ── Solicitar reembolso — removido (sem reembolso) ──────────────────────────
  if (id.startsWith('solicitar_reembolso_')) {
    return interaction.reply({ content: '❌ Esta loja não oferece reembolsos. Entre em contato com o suporte pelo ticket.', ephemeral: true });
  }

  // ── Avaliar produto ──────────────────────────────────────────────────────────
  if (id.startsWith('avaliar_')) {
    const pedidoId = id.replace('avaliar_', '');
    const modal = new ModalBuilder().setCustomId(`modal_avaliacao_${pedidoId}`).setTitle('⭐ Avaliar Produto');
    const nota = new TextInputBuilder().setCustomId('nota').setLabel('Nota (1 a 5)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(1).setPlaceholder('Ex: 5');
    const comentario = new TextInputBuilder().setCustomId('comentario').setLabel('Comentário (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300);
    modal.addComponents(new ActionRowBuilder().addComponents(nota), new ActionRowBuilder().addComponents(comentario));
    return interaction.showModal(modal);
  }

  // ── Avaliação de ticket ──────────────────────────────────────────────────────
  if (id.startsWith('aval_ticket_')) {
    const parts = id.split('_'); // aval_ticket_{ticketId}_{nota}
    const nota = parseInt(parts[parts.length - 1]);
    const ticketId = parts.slice(2, parts.length - 1).join('_');
    db.prepare("UPDATE tickets SET avaliacao=? WHERE id=?").run(nota, ticketId);
    return interaction.reply({ content: `⭐ Avaliação registrada: ${'⭐'.repeat(nota)}. Obrigado pelo feedback!`, ephemeral: true });
  }

  // ── Carrinho ─────────────────────────────────────────────────────────────────
  if (id === 'carrinho_ver') return mostrarCarrinho(interaction);
  if (id === 'carrinho_limpar') {
    limparCarrinho(interaction.user.id);
    return interaction.reply({ content: '🗑️ Carrinho limpo!', ephemeral: true });
  }
  if (id.startsWith('carrinho_add_')) {
    const produtoId = id.replace('carrinho_add_', '');
    const { ok, erro, produto } = adicionarAoCarrinho(interaction.user.id, produtoId);
    return interaction.reply({ content: ok ? `✅ **${produto.nome}** adicionado ao carrinho!` : `❌ ${erro}`, ephemeral: true });
  }
  if (id.startsWith('carrinho_remover_')) {
    const produtoId = id.replace('carrinho_remover_', '');
    removerDoCarrinho(interaction.user.id, produtoId);
    return interaction.reply({ content: '✅ Item removido do carrinho.', ephemeral: true });
  }
  if (id === 'carrinho_comprar_tudo') {
    await interaction.deferReply({ ephemeral: true });
    const itens = listarCarrinho(interaction.user.id);
    if (!itens.length) return interaction.editReply({ content: '🛒 Carrinho vazio.' });
    const total = calcularTotal(itens);
    // Comprar primeiro item do carrinho (pode expandir para múltiplos pedidos)
    const primeiro = itens[0];
    limparCarrinho(interaction.user.id);
    return iniciarCompra(interaction, primeiro.produto_id);
  }

  // ── Tickets ──────────────────────────────────────────────────────────────────
  if (id === 'ticket_fechar') return fecharTicket(interaction);
  if (id === 'ticket_assumir') return assumirTicket(interaction);
  if (id === 'ticket_transcript') return gerarTranscript(interaction);

  if (id.startsWith('ticket_pagar_')) {
    const pedidoId = id.replace('ticket_pagar_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    const produto = Produtos.get(pedido.produto_id);
    return iniciarCompra(interaction, pedido.produto_id);
  }

  if (id === 'ticket_banir_fraude') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const ticket = require('../database/database').Tickets.get(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Não é um ticket.', ephemeral: true });
    const { bloquearPorFraude } = require('../systems/antiFraude');
    await bloquearPorFraude(ticket.usuario_id, `Marcado como fraude por ${interaction.user.tag}`);
    await interaction.reply({ content: `🚫 <@${ticket.usuario_id}> bloqueado por fraude.` });
    return fecharTicket(interaction, 'Bloqueado por fraude');
  }

  // ── Caixas Misteriosas ───────────────────────────────────────────────────────
  if (id === 'caixas_listar') return menuCaixas(interaction);
  if (id === 'caixa_historico') return historicoCaixas(interaction);

  // ── Afiliados ────────────────────────────────────────────────────────────────
  if (id === 'perfil_ver') {
    const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    return interaction.reply({ embeds: [Embeds.perfil(usuario, member)], ephemeral: true });
  }
  if (id === 'afiliado_sacar') return solicitarSaque(interaction);
  if (id === 'afiliado_historico') {
    await interaction.deferReply({ ephemeral: true });
    const hist = db.prepare(`
      SELECT t.*, p.nome as produto_nome FROM transacoes t
      LEFT JOIN pedidos p ON t.ref_id = p.id
      WHERE t.usuario_id = ? AND t.descricao LIKE '%Comissão%'
      ORDER BY t.criado_em DESC LIMIT 10
    `).all(interaction.user.id);
    if (!hist.length) return interaction.editReply({ content: '📜 Nenhuma comissão recebida ainda.' });
    const linhas = hist.map(h => `💰 R$ ${h.valor.toFixed(2)} — ${h.descricao}`);
    return interaction.editReply({ content: `**💸 Histórico de Comissões:**\n\n${linhas.join('\n')}` });
  }

  // ── Saldo ─────────────────────────────────────────────────────────────────
  if (id === 'saldo_historico_completo') {
    const config_ = require('../config');
    const moment_ = require('moment-timezone');
    await interaction.deferReply({ ephemeral: true });
    const { EmbedBuilder: EB } = require('discord.js');
    const rows = db.prepare('SELECT * FROM transacoes WHERE usuario_id=? ORDER BY criado_em DESC LIMIT 20').all(interaction.user.id);
    if (!rows.length) return interaction.editReply({ content: '📜 Nenhuma transação.' });
    const embed = new EB()
      .setColor(config_.colors.primary).setTitle('💳 Histórico Completo de Saldo').setTimestamp();
    for (const t of rows) {
      const sinal = t.tipo === 'credito' ? '🟢 +' : '🔴 -';
      const data  = moment_.unix(t.criado_em).tz(config_.timezone).format('DD/MM/YY HH:mm');
      embed.addFields({ name: `${sinal}R$ ${Number(t.valor).toFixed(2)} — ${data}`, value: t.descricao || 'Sem descrição', inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Comprar caixa misteriosa (pelo botão gerado no selectMenu) ───────────
  if (id.startsWith('comprar_caixa_')) {
    const caixaId = id.replace('comprar_caixa_', '');
    const caixa = db.prepare('SELECT * FROM caixas_misteriosas WHERE id=?').get(caixaId);
    if (!caixa) return interaction.reply({ content: '❌ Caixa não encontrada.', ephemeral: true });

    // Criar pedido para a caixa e processar pagamento
    const { iniciarCompraCaixa } = require('../systems/loja');
    if (typeof iniciarCompraCaixa === 'function') {
      return iniciarCompraCaixa(interaction, caixaId);
    }
    // Fallback: usar compra direta
    return interaction.reply({ content: `💰 Use \`/caixa abrir\` e selecione **${caixa.nome}** para comprar por R$ ${caixa.preco.toFixed(2)}.`, ephemeral: true });
  }
};

async function mostrarLoja(interaction) {
  const { mostrarLoja: ml } = require('../systems/loja');
  return ml(interaction);
}

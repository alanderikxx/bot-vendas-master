const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { iniciarCompra, entregarProduto } = require('../systems/loja');
const efi = require('../systems/efi');
const { fecharTicket, assumirTicket, gerarTranscript } = require('../systems/tickets');
const { adicionarAoCarrinho, removerDoCarrinho, limparCarrinho, mostrarCarrinho, listarCarrinho, calcularTotal } = require('../systems/carrinho');
const { solicitarSaque } = require('../systems/afiliados');
const { Pedidos, Produtos, Usuarios, db } = require('../database/database');
const { isStaff } = require('../utils/permissions');
const { Embeds } = require('../utils/embeds');
const { log } = require('../utils/logger');
const painelButtons = require('./painelButtons');
const config = require('../config');

const painelProdutoHandler = require('./painelProdutoHandler');
const { handlePainelBuilder } = require('../systems/painelProduto');
const { handlePainelAdmin } = require('../systems/painelAdmin');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // ── Abrir caixa misteriosa ────────────────────────────────────────────────────
  if (id === 'abrir_caixa_misteriosa') {
    const { iniciarCompraCaixa } = require('../systems/caixaMisteriosa');
    return iniciarCompraCaixa(interaction, null, client);
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

  // ── Submenus de plano (ap_*), estoque (ae_*), cupom (cu_*) ───────────────
  if (id.startsWith('ap_') || id.startsWith('ae_') || id.startsWith('cu_')) {
    const sub = require('../systems/adminSubmenus');
    // Plano
    if (id === 'ap_produto')  return sub.planoModalProduto(interaction);
    if (id === 'ap_dados')    return sub.planoModalDados(interaction);
    if (id === 'ap_salvar')   return sub.planoSalvar(interaction);
    if (id === 'ap_cancelar') return sub.planoCancelar(interaction);
    // Estoque
    if (id === 'ae_variante') return sub.estoqueModalVariante(interaction);
    if (id === 'ae_slot1')    return sub.estoqueModalSlot(interaction, 1);
    if (id === 'ae_slot2')    return sub.estoqueModalSlot(interaction, 2);
    if (id === 'ae_slot3')    return sub.estoqueModalSlot(interaction, 3);
    if (id === 'ae_slot4')    return sub.estoqueModalSlot(interaction, 4);
    if (id === 'ae_salvar')   return sub.estoqueSalvar(interaction);
    if (id === 'ae_cancelar') return sub.estoqueCancelar(interaction);
    // Cupom
    if (id === 'cu_codigo')   return sub.cupomModal(interaction, 'codigo');
    if (id === 'cu_valor')    return sub.cupomModal(interaction, 'valor');
    if (id === 'cu_validade') return sub.cupomModal(interaction, 'validade');
    if (id === 'cu_limite')   return sub.cupomModal(interaction, 'limite');
    if (id === 'cu_lojas')    return sub.cupomModal(interaction, 'lojas');
    if (id === 'cu_salvar')   return sub.cupomSalvar(interaction);
    if (id === 'cu_cancelar') return sub.cupomCancelar(interaction);
  }

  // ── Submenu Caixa Misteriosa (cxc_*, cxi_*) ──────────────────────────────
  if (id.startsWith('cxc_') || id.startsWith('cxi_')) {
    const cx = require('../systems/caixaSubmenu');
    // Criar caixa
    if (id === 'cxc_nome')     return cx.criarModalNome(interaction);
    if (id === 'cxc_canal')    return cx.criarModalCanal(interaction);
    if (id === 'cxc_desc')     return cx.criarModalDesc(interaction);
    if (id === 'cxc_img')      return cx.criarModalImg(interaction);
    if (id === 'cxc_salvar')   return cx.criarSalvar(interaction);
    if (id === 'cxc_cancelar') return cx.criarCancelar(interaction);
    // Add item
    if (id === 'cxi_caixa')    return cx.itemSelecionarCaixa(interaction);
    if (id === 'cxi_variante') return cx.itemSelecionarVariante(interaction);
    if (id === 'cxi_dados')    return cx.itemModalDados(interaction);
    if (id === 'cxi_salvar')   return cx.itemSalvar(interaction);
    if (id === 'cxi_cancelar') return cx.itemCancelar(interaction);
  }

  // ── Saque de coins via PIX ───────────────────────────────────────────────────
  if (id === 'sacar_coins_pix') {
    const { abrirModalSaque } = require('../systems/saqueCoins');
    return abrirModalSaque(interaction);
  }
  if (id.startsWith('saque_aprovar_')) {
    const saqueId = id.replace('saque_aprovar_', '');
    const { aprovarSaque } = require('../systems/saqueCoins');
    return aprovarSaque(interaction, saqueId);
  }
  if (id.startsWith('saque_rejeitar_')) {
    const saqueId = id.replace('saque_rejeitar_', '');
    const { rejeitarSaque } = require('../systems/saqueCoins');
    return rejeitarSaque(interaction, saqueId);
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

  // ── Recompra com 1 clique ─────────────────────────────────────────────────────
  if (id.startsWith('recomprar_')) {
    const produtoId = id.replace('recomprar_', '');
    return iniciarCompra(interaction, produtoId);
  }

  // ── Notificar quando voltar estoque ──────────────────────────────────────────
  if (id.startsWith('notif_estoque_')) {
    const varianteId = id.replace('notif_estoque_', '');
    const { db } = require('../database/database');
    const { v4: uuidv4 } = require('uuid');
    try {
      db.prepare('INSERT OR IGNORE INTO notif_estoque (id,usuario_id,variante_id) VALUES (?,?,?)').run(uuidv4(), interaction.user.id, varianteId);
      return interaction.reply({ content: '🔔 Você será notificado no privado quando o estoque voltar!', ephemeral: true });
    } catch {
      return interaction.reply({ content: '⚠️ Você já está na lista de notificações.', ephemeral: true });
    }
  }
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

    // Deletar a mensagem do QR Code (a mensagem que contém o botão verificar)
    if (interaction.message) {
      await interaction.message.delete().catch(() => {});
    }

    if (pedido.tx_id && !pedido.tx_id.startsWith('SIM_')) {
      try {
        const status = await efi.consultarCobranca(pedido.tx_id);
        if (status.pago) {
          // Marcar pedido como pago e entregar
          db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE id=?").run(pedidoId);
          const pedidoAtualizado = Pedidos.get(pedidoId);
          await entregarProduto(pedidoAtualizado, client);

          // Fechar ticket automaticamente
          if (pedido.ticket_id) {
            const { Tickets } = require('../database/database');
            const ticket = Tickets.get(pedido.ticket_id);
            if (ticket && ticket.status === 'aberto') {
              Tickets.atualizar(pedido.ticket_id, {
                status: 'fechado', fechado_por: interaction.client.user.id,
                motivo: 'Pagamento confirmado e produto entregue', fechado_em: Math.floor(Date.now()/1000),
              });
              const canalTicket = interaction.guild?.channels.cache.get(pedido.ticket_id);
              if (canalTicket) {
                await canalTicket.send({
                  embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Pagamento Confirmado!')
                    .setDescription('> Produto entregue no seu privado. Ticket encerrado automaticamente.')
                    .setTimestamp()
                    .setFooter({ text: 'Máximo Store • Obrigado pela compra!' })],
                }).catch(() => {});
                setTimeout(() => canalTicket.delete().catch(() => {}), 5000);
              }
            }
          }

          return interaction.editReply({ content: '✅ Pagamento confirmado! Produto entregue no seu privado.' });
        } else {
          return interaction.editReply({ content: '⏳ Pagamento ainda não identificado. Aguarde alguns segundos e tente novamente.' });
        }
      } catch (e) {
        console.error('[VerificarPix]', e.message);
        return interaction.editReply({ content: `❌ Erro ao verificar pagamento: \`${e.message.slice(0,100)}\`\nTente novamente em instantes.` });
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
      .setCustomId(`modal_ticket_cupom_${pedidoId}`)
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

    // Confirmação antes de cancelar
    const produto = Produtos.get(pedido.produto_id);
    const rowConf = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`conf_cancelar_${pedidoId}`).setLabel('✅ Sim, cancelar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`nao_cancelar_${pedidoId}`).setLabel('❌ Não, voltar').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ Confirmar Cancelamento')
        .setDescription([
          `> Tem certeza que deseja cancelar este pedido?`,
          `> Esta ação não pode ser desfeita.`,
        ].join('\n'))
        .addFields(
          { name: '📦 Produto', value: produto?.nome || '—', inline: true },
          { name: '💵 Valor',   value: `R$ ${Number(pedido.valor_total).toFixed(2)}`, inline: true },
        )
        .setTimestamp()],
      components: [rowConf],
      ephemeral: true,
    });
  }

  // ── Confirmar cancelamento ────────────────────────────────────────────────────
  if (id.startsWith('conf_cancelar_')) {
    const pedidoId = id.replace('conf_cancelar_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não pode mais ser cancelado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id && !isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

    Pedidos.atualizar(pedidoId, {
      status: 'cancelado',
      cancelado_por: interaction.user.id,
      motivo_cancel: 'Cancelado pelo usuário',
      cancelado_em: Math.floor(Date.now() / 1000),
    });

    // Fechar o ticket se existir
    if (pedido.ticket_id) {
      const { Tickets } = require('../database/database');
      const ticket = Tickets.get(pedido.ticket_id);
      if (ticket && ticket.status === 'aberto') {
        const canalTicket = interaction.guild?.channels.cache.get(pedido.ticket_id);
        if (canalTicket) {
          await canalTicket.send({
            embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Pedido Cancelado').setDescription('O pedido foi cancelado pelo comprador.').setTimestamp()],
          }).catch(() => {});
          setTimeout(() => canalTicket.delete().catch(() => {}), 5000);
        }
        Tickets.atualizar(pedido.ticket_id, { status: 'fechado', fechado_por: interaction.user.id, motivo: 'Cancelado', fechado_em: Math.floor(Date.now()/1000) });
      }
    }
    return interaction.update({ content: '✅ Pedido cancelado com sucesso.', embeds: [], components: [] });
  }

  if (id.startsWith('nao_cancelar_')) {
    return interaction.update({ content: '✅ Cancelamento abortado. Seu pedido continua ativo.', embeds: [], components: [] });
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

        // Notificar staff no canal de logs
        try {
          const { log } = require('../utils/logger');
          const produto = Produtos.get(pedido.produto_id);
          await log('pagamento', {
            usuario:    pedido.usuario_id,
            pedidoId:   pedido.id,
            produto:    produto?.nome,
            valor:      pedido.valor_total,
            descricao:  `✅ <@${pedido.usuario_id}> confirmou recebimento — ${produto?.nome || 'Produto'} — R$ ${Number(pedido.valor_total).toFixed(2)}`,
          });
        } catch {}
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
  if (id === 'caixas_listar') {
    const { menuCaixas } = require('../systems/caixaMisteriosa');
    return menuCaixas(interaction);
  }
  if (id === 'caixa_historico' || id === 'historico_caixa') {
    const { mostrarHistorico } = require('../systems/caixaMisteriosa');
    return mostrarHistorico(interaction);
  }

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
    const { iniciarCompraCaixa } = require('../systems/caixaMisteriosa');
    return iniciarCompraCaixa(interaction, caixaId, client);
  }
};

async function mostrarLoja(interaction) {
  const { mostrarLoja: ml } = require('../systems/loja');
  return ml(interaction);
}

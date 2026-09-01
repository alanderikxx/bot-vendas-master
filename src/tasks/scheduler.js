const cron = require('node-cron');
const { db, Pedidos, Usuarios } = require('../database/database');
const { log } = require('../utils/logger');
const config = require('../config');
const { EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');

module.exports = function iniciarScheduler(client) {
  // ── Expirar pedidos pendentes há mais de 35 min ───────────────────────────
  cron.schedule('*/10 * * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 2100; // 35 min
      const pedidosExpirados = db.prepare(`
        SELECT * FROM pedidos WHERE status='pendente' AND criado_em < ?
      `).all(limite);

      for (const pedido of pedidosExpirados) {
        Pedidos.atualizar(pedido.id, { status: 'cancelado', motivo_cancel: 'Tempo de pagamento expirado (automático)' });
      }

      if (pedidosExpirados.length > 0) {
        console.log(`[Scheduler] ${pedidosExpirados.length} pedido(s) expirado(s).`);
      }
    } catch (err) {
      console.error('[Scheduler expirar pedidos]', err.message);
    }
  });

  // ── Fechar tickets inativos há mais de 24h ────────────────────────────────
  cron.schedule('0 */1 * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 86400;
      const ticketsInativos = db.prepare("SELECT * FROM tickets WHERE status='aberto' AND criado_em < ?").all(limite);

      for (const ticket of ticketsInativos) {
        db.prepare("UPDATE tickets SET status='fechado', motivo='Fechado automaticamente por inatividade', fechado_em=strftime('%s','now') WHERE id=?").run(ticket.id);
        const guild = client.guilds.cache.first();
        if (!guild) continue;

        const canal = guild.channels.cache.get(ticket.canal_id);

        // Gerar e enviar transcrição antes de deletar o canal
        if (canal) {
          try {
            const { gerarTranscricao, enviarTranscricao } = require('../systems/tickets');
            const buffer = await gerarTranscricao(canal, ticket, guild);
            if (buffer) await enviarTranscricao(guild, ticket, buffer);
          } catch {}

          await canal.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.dark)
              .setTitle('🔒 Ticket Fechado por Inatividade')
              .setDescription('Este ticket foi encerrado automaticamente após 24h sem atividade.')
              .setTimestamp()],
          }).catch(() => {});
          setTimeout(() => canal.delete().catch(() => {}), 10000);
        }
      }

      if (ticketsInativos.length > 0) {
        console.log(`[Scheduler] ${ticketsInativos.length} ticket(s) fechado(s) por inatividade.`);
      }
    } catch (err) {
      console.error('[Scheduler fechar tickets]', err.message);
    }
  });

  // ── Relatório diário às 8h — via webhook ou DM do owner ──────────────────
  cron.schedule('0 8 * * *', async () => {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const ontem = Math.floor(new Date().setHours(0,0,0,0) / 1000) - 86400;
      const hoje  = Math.floor(new Date().setHours(0,0,0,0) / 1000);

      const stats = db.prepare(`
        SELECT COUNT(*) as vendas,
               COALESCE(SUM(valor_total),0) as receita,
               COUNT(DISTINCT usuario_id) as compradores
        FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= ? AND pago_em < ?
      `).get(ontem, hoje);

      const novos   = db.prepare('SELECT COUNT(*) as c FROM usuarios WHERE criado_em >= ? AND criado_em < ?').get(ontem, hoje).c;
      const tickets = db.prepare('SELECT COUNT(*) as c FROM tickets WHERE criado_em >= ? AND criado_em < ?').get(ontem, hoje).c;
      const convites = db.prepare('SELECT COUNT(*) as c FROM convites WHERE criado_em >= ? AND criado_em < ?').get(ontem, hoje).c;

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('📊 Relatório Diário')
        .setDescription(`**${moment.unix(ontem).tz(config.timezone).format('DD/MM/YYYY')}**`)
        .addFields(
          { name: '🛒 Vendas',       value: String(stats.vendas),                          inline: true },
          { name: '💰 Receita',      value: `R$ ${Number(stats.receita).toFixed(2)}`,      inline: true },
          { name: '👥 Compradores',  value: String(stats.compradores),                     inline: true },
          { name: '🆕 Novos',        value: String(novos),                                 inline: true },
          { name: '🎫 Tickets',      value: String(tickets),                               inline: true },
          { name: '🔗 Convites',     value: String(convites),                              inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Relatório Automático' });

      // Enviar para o owner por DM (não polui o canal de logs)
      const ownerRole = guild.roles.cache.get(config.roles.owner);
      if (ownerRole) {
        for (const [, member] of ownerRole.members) {
          await member.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Scheduler relatório]', err.message);
    }
  });

  // ── Alerta de estoque baixo (a cada 6 horas) ─────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    try {
      const produtosBaixo = db.prepare(`
        SELECT p.*, (SELECT COUNT(*) FROM estoque_digital WHERE produto_id=p.id AND usado=0) as est_digital
        FROM produtos p WHERE p.ativo=1 AND p.tipo='digital'
      `).all().filter(p => p.est_digital <= 5 && p.est_digital >= 0);

      for (const p of produtosBaixo) {
        await log('estoque_baixo', {
          produto: p.nome,
          descricao: `Estoque baixo: **${p.nome}** — ${p.est_digital} unidade(s) restante(s)`,
        });
      }
    } catch (err) {
      console.error('[Scheduler estoque]', err.message);
    }
  });

  // ── Limpeza de carrinho abandonado (24h) ──────────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 86400;
      const res = db.prepare('DELETE FROM carrinho WHERE adicionado < ?').run(limite);
      if (res.changes > 0) console.log(`[Scheduler] ${res.changes} item(ns) removido(s) de carrinhos abandonados.`);
    } catch (err) {
      console.error('[Scheduler carrinho]', err.message);
    }
  });

  // ── Notificações de pagamentos pendentes (lembretes) ─────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const limite = Math.floor(Date.now() / 1000) - 900; // 15 min atrás
      const limite2 = Math.floor(Date.now() / 1000) - 1800; // 30 min atrás
      const pedidosPendentes = db.prepare(`
        SELECT * FROM pedidos WHERE status='pendente' AND criado_em BETWEEN ? AND ?
      `).all(limite2, limite);

      const guild = client.guilds.cache.first();
      if (!guild) return;

      for (const pedido of pedidosPendentes) {
        try {
          const member = await guild.members.fetch(pedido.usuario_id).catch(() => null);
          if (!member) continue;
          await member.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.warning)
              .setTitle('⏰ Lembrete de Pagamento')
              .setDescription(`Você tem um pedido pendente de pagamento!\n\n🆔 Pedido: \`${pedido.id.slice(0,8).toUpperCase()}\`\n💵 Valor: R$ ${pedido.valor_total.toFixed(2)}\n\n⚠️ O pagamento expira em breve!`)
              .setTimestamp()],
          }).catch(() => {});
        } catch {}
      }
    } catch (err) {
      console.error('[Scheduler lembretes]', err.message);
    }
  });

  console.log('⏰ Scheduler iniciado com sucesso!');
};

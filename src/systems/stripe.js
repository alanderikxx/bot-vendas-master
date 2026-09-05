/**
 * Sistema de pagamento Stripe (multi-moeda)
 * Moedas suportadas: USD, EUR, GBP, CAD
 * Taxa: 50% sobre a conversão BRL → moeda destino
 */

const axios = require('axios');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

const MOEDAS = {
  USD: { nome: 'Dólar Americano',   emoji: '🇺🇸', simbolo: '$'   },
  EUR: { nome: 'Euro',              emoji: '🇪🇺', simbolo: '€'   },
  GBP: { nome: 'Libra Esterlina',   emoji: '🇬🇧', simbolo: '£'   },
  CAD: { nome: 'Dólar Canadense',   emoji: '🇨🇦', simbolo: 'CA$' },
  AUD: { nome: 'Dólar Australiano', emoji: '🇦🇺', simbolo: 'A$'  },
  JPY: { nome: 'Iene Japonês',      emoji: '🇯🇵', simbolo: '¥'   },
  CHF: { nome: 'Franco Suíço',      emoji: '🇨🇭', simbolo: 'CHF' },
  MXN: { nome: 'Peso Mexicano',     emoji: '🇲🇽', simbolo: '$'   },
  ARS: { nome: 'Peso Argentino',    emoji: '🇦🇷', simbolo: '$'   },
  CLP: { nome: 'Peso Chileno',      emoji: '🇨🇱', simbolo: '$'   },
  COP: { nome: 'Peso Colombiano',   emoji: '🇨🇴', simbolo: '$'   },
  PEN: { nome: 'Sol Peruano',       emoji: '🇵🇪', simbolo: 'S/.' },
  NOK: { nome: 'Coroa Norueguesa',  emoji: '🇳🇴', simbolo: 'kr'  },
  SEK: { nome: 'Coroa Sueca',       emoji: '🇸🇪', simbolo: 'kr'  },
  DKK: { nome: 'Coroa Dinamarquesa',emoji: '🇩🇰', simbolo: 'kr'  },
  NZD: { nome: 'Dólar Neozelandês', emoji: '🇳🇿', simbolo: 'NZ$' },
  SGD: { nome: 'Dólar Singapura',   emoji: '🇸🇬', simbolo: 'S$'  },
  HKD: { nome: 'Dólar Hong Kong',   emoji: '🇭🇰', simbolo: 'HK$' },
  PLN: { nome: 'Zloty Polonês',     emoji: '🇵🇱', simbolo: 'zł'  },
};

// ─── Converter BRL para moeda destino com taxa de 50% ─────────────────────────
async function brlParaMoeda(valorBrl, moeda = 'USD') {
  const FALLBACK = {
    USD: 0.20, EUR: 0.18, GBP: 0.16, CAD: 0.27,
    AUD: 0.30, JPY: 29.0, CHF: 0.17, MXN: 3.40,
    ARS: 195.0, CLP: 195.0, COP: 820.0, PEN: 0.74,
    NOK: 2.10, SEK: 2.10, DKK: 1.35, NZD: 0.33,
    SGD: 0.27, HKD: 1.56, PLN: 0.79,
  };
  try {
    const res  = await axios.get('https://api.exchangerate-api.com/v4/latest/BRL').catch(() => null);
    const taxa = res?.data?.rates?.[moeda] || FALLBACK[moeda] || 0.20;
    return Number((valorBrl * taxa * 1.50).toFixed(2));
  } catch {
    return Number((valorBrl * (FALLBACK[moeda] || 0.20) * 1.50).toFixed(2));
  }
}

// ─── Criar Checkout Session ───────────────────────────────────────────────────
async function criarCheckout({ valorBrl, descricao, pedidoId, moeda = 'USD' }) {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY não configurado');

  const valorMoeda = await brlParaMoeda(valorBrl, moeda);
  const valorCents = Math.round(valorMoeda * 100);
  const base       = process.env.WEBHOOK_URL?.replace('/webhook', '') || 'https://bot-vendas-master-production.up.railway.app';

  const params = new URLSearchParams({
    'payment_method_types[]':                        'card',
    'line_items[0][price_data][currency]':           moeda.toLowerCase(),
    'line_items[0][price_data][product_data][name]': descricao || 'Máximo Store',
    'line_items[0][price_data][unit_amount]':        String(valorCents),
    'line_items[0][quantity]':                       '1',
    'mode':                                          'payment',
    'success_url':                                   `${base}/stripe/sucesso?session_id={CHECKOUT_SESSION_ID}&pedido=${pedidoId}`,
    'cancel_url':                                    `${base}/stripe/cancelar`,
    'metadata[pedido_id]':                           pedidoId,
    'metadata[moeda]':                               moeda,
  });

  const res = await axios.post(
    'https://api.stripe.com/v1/checkout/sessions',
    params.toString(),
    { headers: { Authorization: `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return {
    sessionId:  res.data.id,
    linkPagar:  res.data.url,
    valorMoeda,
    moeda,
    valorBrl,
  };
}

// ─── Consultar sessão ─────────────────────────────────────────────────────────
async function consultarSessao(sessionId) {
  const res = await axios.get(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
    { headers: { Authorization: `Bearer ${STRIPE_SECRET}` } }
  );
  return {
    pago:     res.data.payment_status === 'paid',
    pedidoId: res.data.metadata?.pedido_id,
    moeda:    res.data.metadata?.moeda,
  };
}

// ─── Verificar assinatura do webhook ─────────────────────────────────────────
function verificarWebhook(payload, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET não configurado');
  const crypto        = require('crypto');
  const parts         = signature.split(',');
  const timestamp     = parts.find(p => p.startsWith('t='))?.split('=')[1];
  const v1            = parts.find(p => p.startsWith('v1='))?.split('=')[1];
  if (!timestamp || !v1) throw new Error('Assinatura inválida');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  if (expected !== v1) throw new Error('Assinatura não confere');
  return JSON.parse(payload);
}

module.exports = { brlParaMoeda, criarCheckout, consultarSessao, verificarWebhook, MOEDAS };

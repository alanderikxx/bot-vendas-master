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
  INR: { nome: 'Rupia Indiana',     emoji: '🇮🇳', simbolo: '₹'   },
  TRY: { nome: 'Lira Turca',        emoji: '🇹🇷', simbolo: '₺'   },
  ZAR: { nome: 'Rand Sul-africano', emoji: '🇿🇦', simbolo: 'R'   },
  IDR: { nome: 'Rupia Indonésia',   emoji: '🇮🇩', simbolo: 'Rp'  },
  PHP: { nome: 'Peso Filipino',     emoji: '🇵🇭', simbolo: '₱'   },
};

// ─── Converter BRL para moeda destino com taxa de 50% ─────────────────────────
async function brlParaMoeda(valorBrl, moeda = 'USD') {
  const FALLBACK = {
    USD: 0.20, EUR: 0.18, GBP: 0.16, CAD: 0.27,
    AUD: 0.30, JPY: 29.0, CHF: 0.17, MXN: 3.40,
    ARS: 195.0, CLP: 195.0, COP: 820.0, PEN: 0.74,
    NOK: 2.10, SEK: 2.10, DKK: 1.35, NZD: 0.33,
    SGD: 0.27, HKD: 1.56, PLN: 0.79,
    INR: 16.5, TRY: 6.40, ZAR: 3.70, IDR: 3200.0, PHP: 11.0,
  };
  try {
    const res  = await axios.get('https://api.exchangerate-api.com/v4/latest/BRL').catch(() => null);
    const taxa = res?.data?.rates?.[moeda] || FALLBACK[moeda] || 0.20;
    return Number((valorBrl * taxa * 1.50).toFixed(2));
  } catch {
    return Number((valorBrl * (FALLBACK[moeda] || 0.20) * 1.50).toFixed(2));
  }
}

// ─── Métodos de pagamento por moeda ──────────────────────────────────────────
const METODOS_POR_MOEDA = {
  BRL: ['card', 'boleto'],
  USD: ['card', 'bank_transfer'],
  EUR: ['card', 'bank_transfer'],
  GBP: ['card', 'bank_transfer'],
  CAD: ['card'],
  AUD: ['card'],
  JPY: ['card'],
  CHF: ['card'],
  MXN: ['card'],
  ARS: ['card'],
  CLP: ['card'],
  COP: ['card'],
  PEN: ['card'],
  NOK: ['card'],
  SEK: ['card'],
  DKK: ['card'],
  NZD: ['card'],
  SGD: ['card'],
  HKD: ['card'],
  PLN: ['card'],
  INR: ['card'],
  TRY: ['card'],
  ZAR: ['card'],
  IDR: ['card'],
  PHP: ['card'],
};

// Grupos de métodos para o select menu
const GRUPOS_METODO = {
  card:          { label: '💳 Cartão (+ Apple Pay / Google Pay / Link)', emoji: '💳' },
  boleto:        { label: '🧾 Boleto Bancário',                          emoji: '🧾' },
  bank_transfer: { label: '🏦 Transferência Bancária (ACH/SEPA/Wire)',   emoji: '🏦' },
};

// ─── Criar Checkout Session ───────────────────────────────────────────────────
async function criarCheckout({ valorBrl, descricao, pedidoId, moeda = 'USD', metodo = null }) {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY não configurado');

  const valorMoeda = await brlParaMoeda(valorBrl, moeda);
  // Moedas sem centavos (zero-decimal currencies no Stripe)
  const ZERO_DECIMAL = ['JPY', 'KRW', 'CLP', 'BIF', 'DJF', 'GNF', 'ISK', 'KMF', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
  const valorUnidade = ZERO_DECIMAL.includes(moeda) ? Math.round(valorMoeda) : Math.round(valorMoeda * 100);
  const base         = process.env.WEBHOOK_URL?.replace('/webhook', '') || 'https://bot-vendas-master-production.up.railway.app';

  const params = new URLSearchParams({
    'line_items[0][price_data][currency]':           moeda.toLowerCase(),
    'line_items[0][price_data][product_data][name]': descricao || 'Máximo Store',
    'line_items[0][price_data][unit_amount]':        String(valorUnidade),
    'line_items[0][quantity]':                       '1',
    'mode':                                          'payment',
    'success_url':                                   `${base}/stripe/sucesso?session_id={CHECKOUT_SESSION_ID}&pedido=${pedidoId}`,
    'cancel_url':                                    `${base}/stripe/cancelar`,
    'metadata[pedido_id]':                           pedidoId,
    'metadata[moeda]':                               moeda,
    'metadata[metodo]':                              metodo || 'auto',
  });

  if (metodo === 'boleto' && moeda === 'BRL') {
    params.append('payment_method_types[]', 'boleto');
    params.set('payment_method_options[boleto][expires_after_days]', '3');
  } else {
    // Sempre passa card explicitamente — garante funcionamento em todas as moedas
    params.append('payment_method_types[]', 'card');
  }

  let resData;
  try {
    console.log(`[Stripe] Criando checkout — moeda:${moeda} valor:${valorUnidade} metodo:${metodo||'auto'}`);
    const res = await axios.post(
      'https://api.stripe.com/v1/checkout/sessions',
      params.toString(),
      { headers: { Authorization: `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    resData = res.data;
  } catch (err) {
    const stripeErr = err.response?.data?.error;
    console.error('[Stripe] Erro:', JSON.stringify(stripeErr || err.message));
    throw new Error(stripeErr?.message || err.message);
  }

  return {
    sessionId:  resData.id,
    linkPagar:  resData.url,
    valorMoeda,
    moeda,
    valorBrl,
    metodo:     metodo || 'auto',
  };
}

// ─── Consultar sessão ou payment intent ──────────────────────────────────────
async function consultarSessao(sessionId) {
  // Bank transfer usa PaymentIntent (prefixo pi_), Checkout usa cs_
  const endpoint = sessionId.startsWith('pi_')
    ? `https://api.stripe.com/v1/payment_intents/${sessionId}`
    : `https://api.stripe.com/v1/checkout/sessions/${sessionId}`;

  const res = await axios.get(endpoint, { headers: { Authorization: `Bearer ${STRIPE_SECRET}` } });

  const pago = sessionId.startsWith('pi_')
    ? res.data.status === 'succeeded'
    : res.data.payment_status === 'paid';

  return {
    pago,
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

// ─── Criar transferência bancária via Customer Balance ────────────────────────
async function criarTransferenciaBancaria({ valorBrl, descricao, pedidoId, moeda = 'USD', nomeCliente, emailCliente }) {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY não configurado');

  const valorMoeda = await brlParaMoeda(valorBrl, moeda);
  // JPY não usa centavos
  const valorUnidade = moeda === 'JPY' ? Math.round(valorMoeda) : Math.round(valorMoeda * 100);

  const headers = { Authorization: `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' };

  // 1. Criar ou buscar Customer
  const custParams = new URLSearchParams({
    'description': descricao || 'Máximo Store',
    'metadata[pedido_id]': pedidoId,
  });
  if (nomeCliente) custParams.set('name', nomeCliente);
  if (emailCliente) custParams.set('email', emailCliente);

  const custRes = await axios.post('https://api.stripe.com/v1/customers', custParams.toString(), { headers });
  const customerId = custRes.data.id;

  // 2. Definir tipo de transferência por moeda
  const tipoTransf = moeda === 'USD' ? 'us_bank_transfer'
                   : moeda === 'EUR' ? 'eu_bank_transfer'
                   : moeda === 'GBP' ? 'gb_bank_transfer'
                   : 'us_bank_transfer';

  // 3. Criar PaymentIntent com customer_balance
  const piParams = new URLSearchParams({
    'amount':                                          String(valorUnidade),
    'currency':                                        moeda.toLowerCase(),
    'customer':                                        customerId,
    'payment_method_types[]':                          'customer_balance',
    'payment_method_data[type]':                       'customer_balance',
    'confirm':                                         'true',
    'payment_method_options[customer_balance][funding_type]': 'bank_transfer',
    [`payment_method_options[customer_balance][bank_transfer][type]`]: tipoTransf,
    'description':                                     descricao || 'Máximo Store',
    'metadata[pedido_id]':                             pedidoId,
    'metadata[moeda]':                                 moeda,
  });

  // Para EUR precisa especificar o país
  if (moeda === 'EUR') {
    piParams.set('payment_method_options[customer_balance][bank_transfer][eu_bank_transfer][country]', 'DE');
  }

  const piRes = await axios.post('https://api.stripe.com/v1/payment_intents', piParams.toString(), { headers });
  const pi = piRes.data;

  // 4. Extrair dados bancários
  const nextAction = pi.next_action;
  const dadosBancarios = nextAction?.display_bank_transfer_instructions;

  return {
    paymentIntentId: pi.id,
    customerId,
    valorMoeda,
    moeda,
    valorBrl,
    dadosBancarios,  // contém os dados de conta para transferência
    expira: dadosBancarios?.amount_remaining,
    referencia: dadosBancarios?.reference,
  };
}

module.exports = { brlParaMoeda, criarCheckout, criarTransferenciaBancaria, consultarSessao, verificarWebhook, MOEDAS, METODOS_POR_MOEDA, GRUPOS_METODO };

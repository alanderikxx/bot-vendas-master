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
// Cada moeda tem métodos nativos além do cartão
const METODOS_POR_MOEDA = {
  BRL: ['boleto', 'pix'],
  EUR: ['card', 'multibanco', 'mb_way', 'ideal', 'sepa_debit', 'bancontact', 'eps', 'giropay', 'klarna', 'sofort'],
  GBP: ['card', 'bacs_debit', 'klarna'],
  USD: ['card', 'us_bank_account', 'afterpay_clearpay', 'affirm', 'klarna'],
  CAD: ['card', 'afterpay_clearpay'],
  AUD: ['card', 'afterpay_clearpay'],
  JPY: ['card', 'konbini'],
  MXN: ['card', 'oxxo'],
  PLN: ['card', 'blik', 'p24'],
  NOK: ['card', 'klarna'],
  SEK: ['card', 'klarna'],
  DKK: ['card', 'klarna'],
  SGD: ['card', 'paynow'],
  HKD: ['card', 'alipay', 'wechat_pay'],
  CNY: ['card', 'alipay', 'wechat_pay'],
};

// Grupos de métodos para o select menu (o que mostrar pro usuário)
const GRUPOS_METODO = {
  card:             { label: '💳 Cartão de Crédito/Débito', emoji: '💳' },
  boleto:           { label: '🧾 Boleto Bancário',          emoji: '🧾' },
  pix:              { label: '💠 PIX (Stripe)',              emoji: '💠' },
  multibanco:       { label: '🇵🇹 Multibanco (Portugal)',    emoji: '🇵🇹' },
  mb_way:           { label: '🇵🇹 MB WAY (Portugal)',        emoji: '🇵🇹' },
  ideal:            { label: '🏦 iDEAL (Holanda)',           emoji: '🏦' },
  sepa_debit:       { label: '🇪🇺 SEPA Débito',              emoji: '🇪🇺' },
  bancontact:       { label: '🇧🇪 Bancontact (Bélgica)',      emoji: '🇧🇪' },
  blik:             { label: '🇵🇱 BLIK (Polônia)',            emoji: '🇵🇱' },
  p24:              { label: '🇵🇱 Przelewy24 (Polônia)',      emoji: '🇵🇱' },
  eps:              { label: '🇦🇹 EPS (Áustria)',             emoji: '🇦🇹' },
  giropay:          { label: '🇩🇪 Giropay (Alemanha)',        emoji: '🇩🇪' },
  klarna:           { label: '🛍️ Klarna (Pague Depois)',     emoji: '🛍️' },
  afterpay_clearpay:{ label: '🛍️ Afterpay/Clearpay',        emoji: '🛍️' },
  affirm:           { label: '🛍️ Affirm (EUA)',              emoji: '🛍️' },
  oxxo:             { label: '🏪 OXXO (México)',              emoji: '🏪' },
  konbini:          { label: '🏪 Konbini (Japão)',            emoji: '🏪' },
  us_bank_account:  { label: '🏦 ACH (Débito EUA)',           emoji: '🏦' },
  bacs_debit:       { label: '🏦 Bacs Débito (UK)',           emoji: '🏦' },
  alipay:           { label: '📱 Alipay',                    emoji: '📱' },
  wechat_pay:       { label: '📱 WeChat Pay',                 emoji: '📱' },
  paynow:           { label: '📱 PayNow (Singapura)',         emoji: '📱' },
  sofort:           { label: '🏦 Sofort (Europa)',            emoji: '🏦' },
};

// ─── Criar Checkout Session ───────────────────────────────────────────────────
async function criarCheckout({ valorBrl, descricao, pedidoId, moeda = 'USD', metodo = null }) {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY não configurado');

  const valorMoeda = await brlParaMoeda(valorBrl, moeda);
  const valorCents = Math.round(valorMoeda * 100);
  const base       = process.env.WEBHOOK_URL?.replace('/webhook', '') || 'https://bot-vendas-master-production.up.railway.app';

  const params = new URLSearchParams({
    'line_items[0][price_data][currency]':           moeda.toLowerCase(),
    'line_items[0][price_data][product_data][name]': descricao || 'Máximo Store',
    'line_items[0][price_data][unit_amount]':        String(valorCents),
    'line_items[0][quantity]':                       '1',
    'mode':                                          'payment',
    'success_url':                                   `${base}/stripe/sucesso?session_id={CHECKOUT_SESSION_ID}&pedido=${pedidoId}`,
    'cancel_url':                                    `${base}/stripe/cancelar`,
    'metadata[pedido_id]':                           pedidoId,
    'metadata[moeda]':                               moeda,
    'metadata[metodo]':                              metodo || 'auto',
  });

  if (metodo && metodo !== 'auto') {
    // Método específico escolhido pelo usuário
    params.append('payment_method_types[]', metodo);
    // Card sempre como fallback junto (exceto métodos que não combinam)
    const semCard = ['boleto', 'oxxo', 'konbini', 'multibanco', 'mb_way', 'blik', 'p24', 'ideal', 'bancontact', 'eps', 'giropay', 'sofort'];
    if (!semCard.includes(metodo)) {
      params.append('payment_method_types[]', 'card');
    }
    if (metodo === 'boleto') {
      params.set('payment_method_options[boleto][expires_after_days]', '3');
    }
  } else {
    // Automático — Stripe mostra todos os métodos disponíveis para a moeda/país
    params.append('automatic_payment_methods[enabled]', 'true');
    params.append('automatic_payment_methods[allow_redirects]', 'always');
  }

  let resData;
  try {
    const res = await axios.post(
      'https://api.stripe.com/v1/checkout/sessions',
      params.toString(),
      { headers: { Authorization: `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    resData = res.data;
  } catch (err) {
    // Log detalhado do erro Stripe para diagnóstico
    const stripeErr = err.response?.data?.error;
    console.error('[Stripe] Erro detalhado:', JSON.stringify(stripeErr || err.message));
    // Fallback: se método específico falhou, tenta com card
    if (metodo && metodo !== 'auto' && metodo !== 'card') {
      console.log('[Stripe] Tentando fallback para card...');
      params.delete('payment_method_types[]');
      params.append('payment_method_types[]', 'card');
      const res2 = await axios.post(
        'https://api.stripe.com/v1/checkout/sessions',
        params.toString(),
        { headers: { Authorization: `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      resData = res2.data;
    } else {
      throw err;
    }
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

module.exports = { brlParaMoeda, criarCheckout, consultarSessao, verificarWebhook, MOEDAS, METODOS_POR_MOEDA, GRUPOS_METODO };

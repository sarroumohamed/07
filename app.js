'use strict';

// بيانات دبي بالدرهم المغربي، وبيانات الصين كما وردت في ورقة COD in Africa المرفقة.
// رسوم الخدمة هي رسوم لكل طلب ناجح وليست مجموع خدمات إضافية مستقلة.
const COUNTRIES = [
  { id: 'BF', label: '🇧🇫 بوركينا فاسو', service: 84, dubai: 168, china: { rate: 12000, currency: 'XOF' } },
  { id: 'BJ', label: '🇧🇯 بنين', service: 84, dubai: 168, china: { rate: 12000, currency: 'XOF' } },
  { id: 'NE', label: '🇳🇪 النيجر', service: 84, dubai: 168, china: { rate: 12000, currency: 'XOF' } },
  { id: 'CI', label: '🇨🇮 كوت ديفوار', service: 84, dubai: 151, china: { rate: 11000, special: 13000, currency: 'XOF' } },
  { id: 'TG', label: '🇹🇬 توغو', service: 84, dubai: 151, china: { rate: 12000, currency: 'XOF' } },
  { id: 'ML', label: '🇲🇱 مالي', service: 84, dubai: 159, china: { rate: 12000, currency: 'XOF' } },
  { id: 'CG', label: '🇨🇬 الكونغو برازافيل', service: 84, dubai: 167, china: { rate: 13000, currency: 'XAF' } },
  { id: 'TD', label: '🇹🇩 تشاد', service: 109, dubai: 186, china: { rate: 13000, currency: 'XAF' } },
  { id: 'GA', label: '🇬🇦 الغابون', service: 109, dubai: 193, china: { rate: 13000, currency: 'XAF' } },
  { id: 'GN', label: '🇬🇳 غينيا كوناكري', service: 94, dubai: 133, china: { rate: 214200, currency: 'GNF' } },
  { id: 'CD', label: '🇨🇩 الكونغو الديمقراطية', service: 117, dubai: 167, china: { rate: 21, currency: 'USD' } },
  { id: 'CM', label: '🇨🇲 الكاميرون', service: 101, dubai: 143, china: null },
  { id: 'SN', label: '🇸🇳 السنغال', service: 84, dubai: 134, china: null }
];

// معدلات احتياطية *تقريبية* فقط عند غياب الإنترنت. يتم تحديثها تلقائياً عند الاتصال.
const FALLBACK_MAD_PER_UNIT = Object.freeze({ XOF: 0.016, XAF: 0.016, GNF: 0.00089, USD: 9.3 });
const CURRENCY_NAME = { XOF: 'فرنك غرب إفريقي (XOF)', XAF: 'فرنك وسط إفريقي (XAF)', GNF: 'فرنك غيني (GNF)', USD: 'دولار أمريكي (USD)' };
const E = id => document.getElementById(id);
let countryElement;
const state = { origin: 'dubai', fx: { ...FALLBACK_MAD_PER_UNIT }, fxStatus: 'estimate', fxDate: null, manualFx: {} };
const formFields = ['unitPrice','quantity','weight','weightUnit','adsCost','profit','shipmentType','manualShipping'];
const format = value => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rateFormat = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 7 });
const getCountry = () => COUNTRIES.find(country => country.id === countryElement.value);
const show = (el, yes) => el.classList.toggle('hidden', !yes);

function currencyOf(country) {
  return state.origin === 'china' && country?.china ? country.china.currency : null;
}

function shippingInfo(country) {
  if (!country) return null;
  if (state.origin === 'dubai') return { rate: country.dubai, source: 'dubai' };
  if (!country.china) {
    const rate = readNumber('manualShipping');
    return { rate: rate === null ? null : rate, source: 'manual' };
  }
  const { rate, special, currency } = country.china;
  const nominal = country.id === 'CI' && E('shipmentType').value === 'special' ? special : rate;
  const exchange = Object.hasOwn(state.manualFx, currency) ? state.manualFx[currency] : state.fx[currency];
  return { rate: nominal * exchange, nominal, currency, source: state.manualFx[currency] ? 'manual-fx' : state.fxStatus };
}

function updateRateAndFxControls() {
  const country = getCountry();
  const china = state.origin === 'china';
  const manualNeeded = china && !!country && !country.china;
  const exchangeCurrency = currencyOf(country);
  show(E('batteryBox'), china && country?.id === 'CI');
  show(E('manualShippingWrap'), manualNeeded);
  show(E('fxDetails'), !!exchangeCurrency);
  E('rateService').textContent = country ? `${country.service} درهم` : '—';
  const info = shippingInfo(country);
  if (!country) E('rateShipping').textContent = 'اختر الدولة';
  else if (manualNeeded) E('rateShipping').textContent = info?.rate !== null ? `${rateFormat(info.rate)} درهم` : 'غير متوفر';
  else if (china) {
    E('rateShipping').textContent = `${rateFormat(info.nominal)} ${info.currency} ≈ ${format(info.rate)} درهم`;
  } else E('rateShipping').textContent = `${country.dubai} درهم`;
  if (exchangeCurrency) {
    const exchange = state.manualFx[exchangeCurrency] ?? state.fx[exchangeCurrency];
    E('fxLabel').textContent = `قيمة 1 ${exchangeCurrency} بالدرهم المغربي`;
    // Avoid replacing an input while it is being edited.
    if (document.activeElement !== E('fxInput')) E('fxInput').value = rateFormat(exchange);
    const message = Object.hasOwn(state.manualFx, exchangeCurrency) ? '· معدل يدوي' : state.fxStatus === 'live' ? '· معدل تلقائي' : state.fxStatus === 'loading' ? '· جارٍ التحديث' : '· معدل تقريبي';
    E('fxState').textContent = message;
    E('fxDate').textContent = state.fxStatus === 'live' && state.fxDate ? `سعر الصرف التلقائي بتاريخ ${state.fxDate}` : 'يمكنك تعديل سعر الصرف عند الحاجة. سعر الصرف التقريبي قد يختلف عن سعر البنك.';
  }
}

function readNumber(id) {
  const input = E(id);
  if (!input.value.trim()) return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function clearResults() {
  for (const id of ['capitalValue','saleValue','purchaseTotal','shippingTotal','landedPrice','serviceDetail','adsDetail','profitDetail']) E(id).textContent = '—';
  E('detailsBreakdown').setAttribute('disabled', '');
  E('detailsBreakdown').open = false;
}

function status(message, type = '') {
  const el = E('statusMessage');
  el.textContent = message;
  el.className = 'status-message' + (type ? ` ${type}` : '');
}

function calculate() {
  const country = getCountry();
  updateRateAndFxControls();
  if (!country) { clearResults(); status('اختر الدولة وأدخل الأرقام لإظهار النتيجة.'); return; }
  const info = shippingInfo(country);
  if (info?.rate === null || !Number.isFinite(info?.rate) || info.rate < 0) {
    clearResults(); status('أدخل تعريفة الشحن من الصين لهذه الدولة أولاً.', 'error'); return;
  }
  const values = ['unitPrice','quantity','weight','adsCost','profit'].map(readNumber);
  if (values.some(v => v === null)) { clearResults(); status('أكمل الحقول الخمسة وستظهر النتيجة تلقائياً.'); return; }
  const [unitPrice, quantity, enteredWeight, ads, profit] = values;
  if (unitPrice < 0 || enteredWeight <= 0 || ads < 0 || profit < 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1000000) {
    clearResults(); status('تأكد من الأرقام: الوزن والكمية أكبر من صفر، وبقية القيم غير سالبة.', 'error'); return;
  }
  const weightKg = E('weightUnit').value === 'g' ? enteredWeight / 1000 : enteredWeight;
  const freightOne = weightKg * info.rate;
  const totalPurchase = unitPrice * quantity;
  const totalFreight = freightOne * quantity;
  const capital = totalPurchase + totalFreight;
  const landed = unitPrice + freightOne;
  const sale = landed + country.service + ads + profit;
  if (![freightOne, capital, sale].every(Number.isFinite)) { clearResults(); status('الأرقام كبيرة جداً. أدخل قيماً أصغر.', 'error'); return; }

  E('capitalValue').textContent = format(capital);
  E('saleValue').textContent = format(sale);
  const details = { purchaseTotal: totalPurchase, shippingTotal: totalFreight, landedPrice: landed, serviceDetail: country.service, adsDetail: ads, profitDetail: profit };
  for (const [id, amount] of Object.entries(details)) E(id).textContent = `${format(amount)} درهم`;
  E('detailsBreakdown').removeAttribute('disabled');
  const useApprox = state.origin === 'china' && country.china && state.fxStatus !== 'live' && !Object.hasOwn(state.manualFx, country.china.currency);
  status(useApprox ? 'النتيجة تقديرية بسعر صرف احتياطي. اتصل بالإنترنت للحصول على سعر صرف أحدث أو عدّله يدوياً.' : 'تم الحساب بناءً على التعريفات المدخلة. راجع الأسعار قبل الاستيراد.', 'success');
}

async function getLatestExchangeRates() {
  state.fxStatus = 'loading';
  updateRateAndFxControls();
  const urls = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/mad.min.json',
    'https://latest.currency-api.pages.dev/v1/currencies/mad.min.json'
  ];
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.mad || !['xof','xaf','gnf','usd'].every(c => Number.isFinite(data.mad[c]) && data.mad[c] > 0)) continue;
      for (const code of Object.keys(FALLBACK_MAD_PER_UNIT)) state.fx[code] = 1 / data.mad[code.toLowerCase()];
      state.fxStatus = 'live';
      state.fxDate = data.date || null;
      calculate();
      return;
    } catch (_) { /* use the second endpoint or the explicitly labelled estimate */ }
    finally { clearTimeout(timeout); }
  }
  state.fxStatus = 'estimate';
  calculate();
}

function init() {
  countryElement = E('country');
  for (const country of COUNTRIES) {
    const opt = document.createElement('option');
    opt.value = country.id;
    opt.textContent = country.label;
    countryElement.appendChild(opt);
  }
  document.querySelectorAll('[data-origin]').forEach(button => button.addEventListener('click', () => {
    state.origin = button.dataset.origin;
    document.querySelectorAll('[data-origin]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    calculate();
  }));
  countryElement.addEventListener('change', calculate);
  for (const id of formFields) E(id).addEventListener(id === 'weightUnit' || id === 'shipmentType' ? 'change' : 'input', calculate);
  E('fxInput').addEventListener('input', () => {
    const cur = currencyOf(getCountry());
    if (!cur) return;
    const value = readNumber('fxInput');
    if (value !== null && value > 0) state.manualFx[cur] = value;
    else delete state.manualFx[cur];
    calculate();
  });
  E('resetFx').addEventListener('click', () => {
    const cur = currencyOf(getCountry());
    if (cur) delete state.manualFx[cur];
    E('fxInput').blur();
    calculate();
  });
  calculate();
  getLatestExchangeRates();
}

document.addEventListener('DOMContentLoaded', init);

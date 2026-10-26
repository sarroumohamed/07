/**
 * AfriCalc — حاسبة رأس مال الاستيراد وسعر البيع للدفع عند الاستلام.
 * الرسوم أدناه ثابتة بالدرهم المغربي (MAD)، وليست أسعار صرف أو عروضاً حية.
 * يمكنك تحديث الرسوم من مصفوفة COUNTRIES.
 */
const COUNTRIES = [
  { code: 'CI', name: '🇨🇮 كوت ديفوار', service: 84, shipping: 151 },
  { code: 'BF', name: '🇧🇫 بوركينا فاسو', service: 84, shipping: 168 },
  { code: 'BJ', name: '🇧🇯 بنين', service: 84, shipping: 168 },
  { code: 'NE', name: '🇳🇪 النيجر', service: 84, shipping: 168 },
  { code: 'TG', name: '🇹🇬 توغو', service: 84, shipping: 151 },
  { code: 'ML', name: '🇲🇱 مالي', service: 84, shipping: 159 },
  { code: 'CG', name: '🇨🇬 الكونغو برازافيل', service: 84, shipping: 167 },
  { code: 'TD', name: '🇹🇩 تشاد', service: 109, shipping: 186 },
  { code: 'GA', name: '🇬🇦 الغابون', service: 109, shipping: 193 },
  { code: 'GN', name: '🇬🇳 غينيا كوناكري', service: 94, shipping: 133 },
  { code: 'CD', name: '🇨🇩 الكونغو الديمقراطية', service: 117, shipping: 167 },
  { code: 'CM', name: '🇨🇲 الكاميرون', service: 101, shipping: 143 },
  // السنغال: سعر الشحن متوفر، لكن المستخدم لم يقدّم رسوم الخدمة.
  { code: 'SN', name: '🇸🇳 السنغال', service: null, shipping: 134 }
];

const $ = (id) => document.getElementById(id);
const form = $('calcForm');
const inputs = {
  country: $('country'), unitPrice: $('unitPrice'), quantity: $('quantity'),
  weight: $('weight'), weightUnit: $('weightUnit'), serviceFee: $('serviceFee'),
  adsCost: $('adsCost'), profit: $('profit')
};
const currencyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const weightFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const chartColors = ['#143947', '#28af86', '#eda85b', '#7778e5', '#e96d78'];
let lastReport = null;
let messageTimeout = null;

function money(n) { return currencyFormatter.format(n); }
function withMad(n) { return `${money(n)} MAD`; }
function getCountry() { return COUNTRIES.find(c => c.code === inputs.country.value); }
function readNonNegative(field) {
  if (field.value.trim() === '') return null;
  const number = Number(field.value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function showMessage(message = '', kind = 'error') {
  const el = $('formMessage');
  if (messageTimeout) clearTimeout(messageTimeout);
  el.textContent = message;
  el.className = message ? `form-message visible ${kind}` : 'form-message';
}

function onCountryChange() {
  const country = getCountry();
  if (!country) {
    $('shippingRate').textContent = '—';
    $('serviceRateLabel').textContent = '—';
    $('countryNote').textContent = 'سنملأ تكلفة الشحن ورسوم الخدمة تلقائياً بعد اختيار الدولة.';
    $('countryNote').classList.remove('warn');
    inputs.serviceFee.value = '';
    recalculate();
    return;
  }
  $('shippingRate').textContent = withMad(country.shipping);
  $('serviceRateLabel').textContent = country.service === null ? 'غير محددة' : withMad(country.service);
  inputs.serviceFee.value = country.service === null ? '' : country.service;
  if (country.service === null) {
    $('countryNote').textContent = 'رسوم خدمة السنغال غير متوفرة في البيانات. أدخل الرسوم يدوياً لإتمام الحساب.';
    $('countryNote').classList.add('warn');
  } else {
    $('countryNote').textContent = 'تم تعبئة رسوم الخدمة تلقائياً. يمكنك تعديلها إذا تغيّرت الأسعار.';
    $('countryNote').classList.remove('warn');
  }
  showMessage();
  recalculate();
}

/** حسابات دقيقة حسابياً بناء على الوزن الفعلي بدون تقريب للشحن بالكيلو. */
function calculate() {
  const country = getCountry();
  if (!country) return { error: 'اختر الدولة المستهدفة أولاً.', field: inputs.country };
  const unitPrice = readNonNegative(inputs.unitPrice);
  if (unitPrice === null || unitPrice <= 0) return { error: 'أدخل ثمن المنتج الواحد أكبر من صفر.', field: inputs.unitPrice };
  const quantity = readNonNegative(inputs.quantity);
  if (quantity === null || quantity < 1 || !Number.isInteger(quantity) || quantity > 1000000) return { error: 'أدخل عدداً صحيحاً للمنتجات بين 1 و1,000,000.', field: inputs.quantity };
  const weight = readNonNegative(inputs.weight);
  if (weight === null || weight <= 0) return { error: 'أدخل وزن المنتج الواحد أكبر من صفر.', field: inputs.weight };
  const serviceFee = readNonNegative(inputs.serviceFee);
  if (serviceFee === null) return { error: 'أدخل رسوم الخدمة لكل طلب.', field: inputs.serviceFee };
  const adsCost = readNonNegative(inputs.adsCost);
  if (adsCost === null) return { error: 'أدخل تكلفة الإعلان لكل طلب (يمكن إدخال صفر).', field: inputs.adsCost };
  const profit = readNonNegative(inputs.profit);
  if (profit === null) return { error: 'أدخل الربح المطلوب للقطعة (يمكن إدخال صفر).', field: inputs.profit };

  const weightKg = inputs.weightUnit.value === 'g' ? weight / 1000 : weight;
  const totalWeight = weightKg * quantity;
  const shippingPerUnit = weightKg * country.shipping;
  const shippingTotal = shippingPerUnit * quantity;
  const productTotal = unitPrice * quantity;
  const capital = productTotal + shippingTotal;
  const sellingPrice = unitPrice + shippingPerUnit + serviceFee + adsCost + profit;
  const totalProfit = profit * quantity;
  const vals = [capital, sellingPrice, shippingTotal, totalProfit];
  if (!vals.every(Number.isFinite) || vals.some(n => n > 1e15)) return { error: 'القيم كبيرة جداً. أدخل أرقاماً أصغر.', field: null };
  return { country, unitPrice, quantity, weightKg, totalWeight, serviceFee, adsCost, profit,
    shippingPerUnit, shippingTotal, productTotal, capital, sellingPrice, totalProfit };
}

function resetResults() {
  for (const id of ['capitalValue', 'sellingPriceValue', 'donutTotal', 'detailProduct',
    'detailShipping', 'detailService', 'detailAds', 'detailProfit', 'totalProducts',
    'totalWeight', 'totalShipping', 'totalProfit']) $(id).textContent = '—';
  $('donut').style.background = 'conic-gradient(#e8eeee 0 100%)';
  $('donut').setAttribute('aria-label', 'رسم بياني لتوزيع سعر بيع القطعة، في انتظار البيانات');
  $('resultStatus').innerHTML = '<span></span> في انتظار البيانات';
  $('resultStatus').classList.remove('ready');
  $('copyReport').disabled = true;
  lastReport = null;
}

function updateChart(parts, labels) {
  const total = parts.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const stops = parts.map((amount, index) => {
    const from = cursor;
    cursor += total > 0 ? (amount / total) * 100 : 0;
    return `${chartColors[index]} ${from.toFixed(6)}% ${cursor.toFixed(6)}%`;
  });
  $('donut').style.background = `conic-gradient(${stops.join(', ')})`;
  $('donut').setAttribute('aria-label', `توزيع سعر البيع: ${parts.map((v, i) => `${labels[i]} ${withMad(v)}`).join('، ')}`);
}

function renderResult(d) {
  $('capitalValue').textContent = money(d.capital);
  $('sellingPriceValue').textContent = money(d.sellingPrice);
  $('donutTotal').textContent = money(d.sellingPrice);
  $('detailProduct').textContent = withMad(d.unitPrice);
  $('detailShipping').textContent = withMad(d.shippingPerUnit);
  $('detailService').textContent = withMad(d.serviceFee);
  $('detailAds').textContent = withMad(d.adsCost);
  $('detailProfit').textContent = withMad(d.profit);
  $('totalProducts').textContent = withMad(d.productTotal);
  $('totalWeight').textContent = `${weightFormatter.format(d.totalWeight)} kg`;
  $('totalShipping').textContent = withMad(d.shippingTotal);
  $('totalProfit').textContent = withMad(d.totalProfit);
  $('resultStatus').innerHTML = '<span></span> تم الحساب';
  $('resultStatus').classList.add('ready');
  $('copyReport').disabled = false;
  updateChart(
    [d.unitPrice, d.shippingPerUnit, d.serviceFee, d.adsCost, d.profit],
    ['المنتج', 'الشحن', 'الخدمة', 'الإعلانات', 'الربح']
  );
  lastReport = d;
}

function recalculate() {
  const result = calculate();
  if (result.error) resetResults();
  else renderResult(result);
  return result;
}

function reportText(d) {
  return [
    'AfriCalc — تقرير حساب التجارة الإلكترونية',
    `الدولة: ${d.country.name}`,
    `ثمن المنتج: ${withMad(d.unitPrice)}`,
    `عدد المنتجات: ${d.quantity}`,
    `وزن القطعة: ${weightFormatter.format(d.weightKg)} kg`,
    `تكلفة الشحن لكل كيلوغرام: ${withMad(d.country.shipping)}`,
    `الشحن لكل قطعة: ${withMad(d.shippingPerUnit)}`,
    `رسوم الخدمة لكل طلب: ${withMad(d.serviceFee)}`,
    `إعلانات لكل طلب مباع: ${withMad(d.adsCost)}`,
    `الربح المطلوب لكل قطعة: ${withMad(d.profit)}`,
    `ثمن شراء المخزون: ${withMad(d.productTotal)}`,
    `شحن المخزون بالكامل: ${withMad(d.shippingTotal)}`,
    `رأس مال الاستيراد (منتجات + شحن): ${withMad(d.capital)}`,
    `سعر البيع المطلوب للقطعة: ${withMad(d.sellingPrice)}`,
    `الربح المستهدف إذا بيعت كل الكمية: ${withMad(d.totalProfit)}`,
    'ملاحظة: النتائج لا تشمل مصاريف إضافية أو مخاطر الطلبات غير المسلّمة.'
  ].join('\n');
}

async function copyResult() {
  if (!lastReport) return;
  const content = reportText(lastReport);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(content);
    } else {
      const temp = document.createElement('textarea');
      temp.value = content;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      if (!document.execCommand('copy')) throw new Error('Copy not supported');
      temp.remove();
    }
    $('copyLabel').textContent = 'تم نسخ التقرير ✓';
    setTimeout(() => { $('copyLabel').textContent = 'نسخ تقرير الحساب'; }, 2200);
  } catch {
    showMessage('تعذّر النسخ التلقائي في هذا المتصفح. جرّب متصفحاً أحدث أو تشغيل الصفحة عبر HTTPS.');
  }
}

function fillExample() {
  inputs.country.value = 'CI';
  onCountryChange();
  inputs.unitPrice.value = '65';
  inputs.quantity.value = '10';
  inputs.weight.value = '350';
  inputs.weightUnit.value = 'g';
  inputs.adsCost.value = '25';
  inputs.profit.value = '60';
  recalculate();
  showMessage('هذا مثال افتراضي للتجربة، وليس عرضاً من مورد.', 'success');
}

function clearForm() {
  form.reset();
  onCountryChange();
  showMessage();
  $('country').focus();
}

function init() {
  for (const country of COUNTRIES) {
    const option = document.createElement('option');
    option.value = country.code;
    option.textContent = country.name;
    inputs.country.appendChild(option);
  }
  inputs.country.addEventListener('change', onCountryChange);
  for (const input of Object.values(inputs)) {
    if (input !== inputs.country) input.addEventListener('input', () => { recalculate(); if ($('formMessage').classList.contains('error')) showMessage(); });
  }
  inputs.weightUnit.addEventListener('change', recalculate);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const result = recalculate();
    if (result.error) {
      showMessage(result.error);
      if (result.field) result.field.focus();
    } else {
      showMessage('تم حساب رأس مال الاستيراد وسعر البيع بنجاح.', 'success');
      if (window.innerWidth < 801) $('resultsTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  $('fillExample').addEventListener('click', fillExample);
  $('clearForm').addEventListener('click', clearForm);
  $('copyReport').addEventListener('click', copyResult);
  resetResults();
}

init();

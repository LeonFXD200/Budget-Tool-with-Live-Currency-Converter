'use strict';
// ════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════
const RATE_API  = 'https://api.exchangerate-api.com/v4/latest/USD';
const AI_API    = 'https://api.anthropic.com/v1/messages';
const AI_MODEL  = 'claude-sonnet-4-20250514';

const DEFAULT_CATS = [
  {id:'salary',name:'Salary',icon:'💰',color:'#3fb950',type:'income'},
  {id:'freelance',name:'Freelance',icon:'💻',color:'#58a6ff',type:'income'},
  {id:'investment_i',name:'Investment',icon:'📈',color:'#bc8cff',type:'income'},
  {id:'housing',name:'Housing',icon:'🏠',color:'#ff7b72',type:'expense'},
  {id:'food',name:'Food',icon:'🍔',color:'#ffa657',type:'expense'},
  {id:'transport',name:'Transport',icon:'🚗',color:'#79c0ff',type:'expense'},
  {id:'healthcare',name:'Healthcare',icon:'🏥',color:'#ff9bce',type:'expense'},
  {id:'entertainment',name:'Entertainment',icon:'🎬',color:'#d29922',type:'expense'},
  {id:'shopping',name:'Shopping',icon:'🛍',color:'#56d364',type:'expense'},
  {id:'utilities',name:'Utilities',icon:'⚡',color:'#8b949e',type:'expense'},
  {id:'other',name:'Other',icon:'📦',color:'#6e7681',type:'both'},
];

const PPP_DATA = {
  USD:{name:'United States',bm:5.58},GBP:{name:'United Kingdom',bm:4.19},
  EUR:{name:'Eurozone',bm:5.12},JPY:{name:'Japan',bm:450},
  CNY:{name:'China',bm:24},INR:{name:'India',bm:190},
  BRL:{name:'Brazil',bm:22.9},AUD:{name:'Australia',bm:7.45},
  CAD:{name:'Canada',bm:7.83},CHF:{name:'Switzerland',bm:6.7},
  MXN:{name:'Mexico',bm:72},ZAR:{name:'South Africa',bm:44.9},
  KRW:{name:'South Korea',bm:5200},SGD:{name:'Singapore',bm:6.1},
  SEK:{name:'Sweden',bm:63},NOK:{name:'Norway',bm:72},
  NZD:{name:'New Zealand',bm:7.1},HKD:{name:'Hong Kong',bm:23},
};

const LANGS = {
  en:{dashboard:'Dashboard',transactions:'Transactions',analytics:'Analytics',goals:'Goals & Debts',networth:'Net Worth',bills:'Bills',currency:'Currency',ai:'AI Assistant',settings:'Settings'},
  fr:{dashboard:'Tableau de bord',transactions:'Transactions',analytics:'Analytique',goals:'Objectifs',networth:'Valeur nette',bills:'Factures',currency:'Devises',ai:'Assistant IA',settings:'Paramètres'},
  es:{dashboard:'Panel',transactions:'Transacciones',analytics:'Análisis',goals:'Metas',networth:'Patrimonio',bills:'Facturas',currency:'Divisas',ai:'Asistente IA',settings:'Ajustes'},
  de:{dashboard:'Dashboard',transactions:'Transaktionen',analytics:'Analysen',goals:'Ziele',networth:'Nettovermögen',bills:'Rechnungen',currency:'Währung',ai:'KI-Assistent',settings:'Einstellungen'},
  ar:{dashboard:'لوحة القيادة',transactions:'المعاملات',analytics:'التحليلات',goals:'الأهداف',networth:'صافي الثروة',bills:'الفواتير',currency:'العملة',ai:'المساعد الذكي',settings:'الإعدادات'},
};

const ACCENTS = ['#58a6ff','#3fb950','#f85149','#d29922','#bc8cff','#ff7b72','#ffa657','#56d364'];
const UK_TAX = [{min:0,max:12570,r:0},{min:12570,max:50270,r:.20},{min:50270,max:125140,r:.40},{min:125140,max:Infinity,r:.45}];

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let S = {};
let rates = {};
let charts = {};
let undoStack = [], redoStack = [];
let sessionTimer = null;
let pwaInstallPrompt = null;
let pendingSplitData = null;
let aiHistory = [];

const DEFAULT_STATE = () => ({
  transactions:[], budgetLimits:{}, savingsGoals:[], debts:[],
  assets:[], liabilities:[], investments:[], bills:[], wallet:{},
  rateAlerts:[], customCategories:[],
  displayCurrency: detectLocale(),
  profile:'Personal', profiles:['Personal'],
  theme:'dark', accentColor:'#58a6ff', density:'comfortable',
  fontSize:'medium', language:'en', dateFormat:'DD/MM/YYYY',
  numberFormat:'en-GB', pin:null, sessionTimeout:0,
  notifBills:true, notifBudget:true, notifGoals:true, lowBalThreshold:0,
  aiApiKey:'', activityLog:[],
});

function detectLocale() {
  const l = navigator.language || 'en-GB';
  const map = {'en-GB':'GBP','en-US':'USD','de':'EUR','fr':'EUR','ja':'JPY','zh':'CNY','en-AU':'AUD','en-CA':'CAD','en-IN':'INR'};
  for (const [k,v] of Object.entries(map)) if (l.startsWith(k)) return v;
  return 'GBP';
}

// ════════════════════════════════════════════
// STORAGE
// ════════════════════════════════════════════
const PROFILE_KEYS = ['transactions','budgetLimits','savingsGoals','debts','assets','liabilities','investments','bills','wallet','rateAlerts','customCategories'];
const GLOBAL_KEYS  = ['displayCurrency','profile','profiles','theme','accentColor','density','fontSize','language','dateFormat','numberFormat','pin','sessionTimeout','notifBills','notifBudget','notifGoals','lowBalThreshold','aiApiKey','activityLog'];

function pk(k){ return `bf_${S.profile}_${k}`; }
function gk(k){ return `bf_g_${k}`; }

function saveState() {
  PROFILE_KEYS.forEach(k => localStorage.setItem(pk(k), JSON.stringify(S[k])));
  GLOBAL_KEYS.forEach(k  => localStorage.setItem(gk(k), JSON.stringify(S[k])));
}

function loadState() {
  S = DEFAULT_STATE();
  GLOBAL_KEYS.forEach(k => { const v = localStorage.getItem(gk(k)); if (v !== null) S[k] = JSON.parse(v); });
  loadProfileData();
}

function loadProfileData() {
  PROFILE_KEYS.forEach(k => {
    const v = localStorage.getItem(pk(k));
    if (v !== null) S[k] = JSON.parse(v);
    else if (!(k in DEFAULT_STATE())) S[k] = [];
  });
}

// ════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════
function toast(msg, type='info', dur=3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

function modal(id, show) {
  document.getElementById(id).classList.toggle('hidden', !show);
}

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(S.numberFormat, {style:'currency', currency, maximumFractionDigits:2}).format(amount);
  } catch { return `${currency} ${parseFloat(amount).toFixed(2)}`; }
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  if (S.dateFormat === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
  if (S.dateFormat === 'YYYY-MM-DD') return iso;
  return `${d}/${m}/${y}`;
}

function today() { return new Date().toISOString().split('T')[0]; }

function convert(amount, from, to) {
  if (!rates[from] || !rates[to]) return amount;
  return (amount / rates[from]) * rates[to];
}

function allCats() { return [...DEFAULT_CATS, ...S.customCategories]; }
function catById(id) { return allCats().find(c => c.id === id) || {name:id, icon:'📦', color:'#6e7681'}; }

function pushActivity(msg) {
  if (!S.activityLog) S.activityLog = [];
  S.activityLog.unshift({ msg, time: new Date().toISOString() });
  if (S.activityLog.length > 200) S.activityLog.pop();
  saveState();
}

// Undo/Redo
function pushUndo() {
  undoStack.push(JSON.stringify({transactions:S.transactions, savingsGoals:S.savingsGoals, debts:S.debts, assets:S.assets, liabilities:S.liabilities, investments:S.investments, bills:S.bills, budgetLimits:S.budgetLimits}));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!undoStack.length) { toast('Nothing to undo','info'); return; }
  redoStack.push(JSON.stringify({transactions:S.transactions,savingsGoals:S.savingsGoals,debts:S.debts,assets:S.assets,liabilities:S.liabilities,investments:S.investments,bills:S.bills,budgetLimits:S.budgetLimits}));
  const prev = JSON.parse(undoStack.pop());
  Object.assign(S, prev);
  saveState(); render(); toast('Undone','info');
}

function redo() {
  if (!redoStack.length) { toast('Nothing to redo','info'); return; }
  undoStack.push(JSON.stringify({transactions:S.transactions,savingsGoals:S.savingsGoals,debts:S.debts,assets:S.assets,liabilities:S.liabilities,investments:S.investments,bills:S.bills,budgetLimits:S.budgetLimits}));
  const next = JSON.parse(redoStack.pop());
  Object.assign(S, next);
  saveState(); render(); toast('Redone','info');
}

// ════════════════════════════════════════════
// RATES
// ════════════════════════════════════════════
async function fetchRates(force=false) {
  const cached = localStorage.getItem('bf_rates');
  const cachedAt = localStorage.getItem('bf_rates_at');
  const age = cachedAt ? (Date.now() - parseInt(cachedAt)) / 3600000 : 999;

  if (!force && cached && age < 4) {
    rates = JSON.parse(cached);
    updateRateUI(true, localStorage.getItem('bf_rates_date'));
    return;
  }

  try {
    const res = await fetch(RATE_API);
    const data = await res.json();
    rates = data.rates;
    localStorage.setItem('bf_rates', JSON.stringify(rates));
    localStorage.setItem('bf_rates_at', Date.now().toString());
    localStorage.setItem('bf_rates_date', data.date);
    updateRateUI(true, data.date);
    checkRateAlerts();
  } catch {
    if (cached) { rates = JSON.parse(cached); updateRateUI(false); }
    else rates = {USD:1,GBP:.79,EUR:.92,JPY:149.5,CAD:1.36,AUD:1.53,CHF:.9,CNY:7.24,INR:83.1};
    document.getElementById('rateStatus').textContent = 'Using cached/fallback rates';
    document.getElementById('rateStatus').className = 'rate-status error';
  }
}

function updateRateUI(ok, date) {
  const badge = document.getElementById('rateBadge');
  const status = document.getElementById('rateStatus');
  if (ok) {
    badge.className = 'rate-badge';
    badge.textContent = date ? `Live rates: ${date}` : 'Live';
    status.className = 'rate-status live';
    status.textContent = date ? `Live exchange rates — updated ${date}` : 'Live rates';
  } else {
    badge.className = 'rate-badge stale';
    badge.textContent = 'Stale rates';
  }
}

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  loadState();
  applySettings();
  if (S.pin) showPIN();
  await fetchRates();
  populateAllSelects();
  processRecurring();
  setupNav();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupPWA();
  scheduleNotificationCheck();
  render();
  document.getElementById('txDate').value = today();
});

// ════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════
function switchTab(name) {
  document.querySelectorAll('.nav-btn,.bnav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
  if (name === 'analytics') renderAnalytics();
  if (name === 'currency') { renderRatesGrid(); renderComparison(); renderWallet(); renderRateAlerts(); renderPPP(); }
  if (name === 'networth') renderNetWorth();
  if (name === 'goals') { renderGoals(); renderDebts(); }
  if (name === 'bills') renderBills();
  if (name === 'settings') renderSettings();
  resetSessionTimer();
}

function setupNav() {
  document.querySelectorAll('.nav-btn, .bnav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('.cur-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cur-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.curtab').forEach(c => c.classList.add('hidden'));
      const target = document.getElementById('curtab-' + btn.dataset.curtab);
      if (target) { target.classList.remove('hidden'); }
    });
  });
}

// ════════════════════════════════════════════
// EVENT LISTENERS
// ════════════════════════════════════════════
function setupEventListeners() {
  // Core
  document.getElementById('addTxBtn').addEventListener('click', addTransaction);
  document.getElementById('refreshRatesBtn').addEventListener('click', () => fetchRates(true).then(() => { populateAllSelects(); render(); toast('Rates refreshed','success'); }));
  document.getElementById('displayCurrency').addEventListener('change', e => { S.displayCurrency = e.target.value; saveState(); render(); renderAnalytics(); document.getElementById('displayCurrLabel').textContent = S.displayCurrency; document.getElementById('baseLabel').textContent = S.displayCurrency; });
  document.getElementById('profileSelect').addEventListener('change', e => { S.profile = e.target.value; saveState(); loadProfileData(); render(); populateAllSelects(); toast(`Switched to ${S.profile}`,'info'); });
  document.getElementById('collapseBtn').addEventListener('click', () => { const s = document.getElementById('sidebar'); const collapsed = s.classList.toggle('collapsed'); document.getElementById('mainContent').classList.toggle('sidebar-collapsed', collapsed); document.getElementById('collapseBtn').setAttribute('aria-expanded', !collapsed); });

  // Transactions
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('csvFile').click());
  document.getElementById('csvFile').addEventListener('change', e => { if (e.target.files[0]) importCSV(e.target.files[0]); });
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
  document.getElementById('splitTxBtn').addEventListener('click', openSplitModal);
  document.getElementById('addSplitRow').addEventListener('click', addSplitRow);
  document.getElementById('confirmSplit').addEventListener('click', confirmSplit);
  document.getElementById('aiCategoriseBtn').addEventListener('click', aiCategorise);
  document.getElementById('searchTx').addEventListener('input', renderTransactionTable);
  document.getElementById('filterType').addEventListener('change', renderTransactionTable);
  document.getElementById('filterCategory').addEventListener('change', renderTransactionTable);
  document.getElementById('filterTag').addEventListener('change', renderTransactionTable);
  document.getElementById('filterMonth').addEventListener('change', renderTransactionTable);
  document.getElementById('selectAll').addEventListener('change', e => { document.querySelectorAll('.tx-cb').forEach(cb => cb.checked = e.target.checked); });
  document.getElementById('bulkDeleteBtn').addEventListener('click', bulkDelete);

  // Goals & Debts
  document.getElementById('addGoalBtn').addEventListener('click', addGoal);
  document.getElementById('addDebtBtn').addEventListener('click', addDebt);

  // Net Worth
  document.getElementById('addAssetBtn').addEventListener('click', addAsset);
  document.getElementById('addLiabBtn').addEventListener('click', addLiability);
  document.getElementById('addInvBtn').addEventListener('click', addInvestment);

  // Bills
  document.getElementById('addBillBtn').addEventListener('click', addBill);

  // Currency
  document.getElementById('convAmount').addEventListener('input', updateConverter);
  document.getElementById('convFrom').addEventListener('change', () => { updateConverter(); renderComparison(); });
  document.getElementById('convTo').addEventListener('change', updateConverter);
  document.getElementById('swapBtn').addEventListener('click', () => { const f = document.getElementById('convFrom'), t = document.getElementById('convTo'); [f.value,t.value]=[t.value,f.value]; updateConverter(); });
  document.getElementById('addWalletBtn').addEventListener('click', addWalletBalance);
  document.getElementById('searchRate').addEventListener('input', renderRatesGrid);
  document.getElementById('newAlertBtn').addEventListener('click', () => modal('rateAlertModal', true));
  document.getElementById('saveAlertBtn').addEventListener('click', saveRateAlert);
  document.getElementById('pppAmount').addEventListener('input', renderPPP);
  document.getElementById('pppFrom').addEventListener('change', renderPPP);
  document.getElementById('pppTo').addEventListener('change', renderPPP);

  // Analytics
  document.getElementById('analyticsYear').addEventListener('change', renderAnalytics);
  document.getElementById('yearReviewBtn').addEventListener('click', showYearReview);
  document.getElementById('printReportBtn2').addEventListener('click', printReport);
  document.getElementById('drillCategory').addEventListener('change', renderDrillChart);

  // AI
  document.getElementById('aiSendBtn').addEventListener('click', sendAI);
  document.getElementById('aiInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendAI(); });
  document.querySelectorAll('.ai-quick-btn').forEach(btn => btn.addEventListener('click', () => sendAI(btn.dataset.prompt)));
  document.getElementById('receiptBtn').addEventListener('click', () => document.getElementById('receiptInput').click());
  document.getElementById('receiptInput').addEventListener('change', e => { if (e.target.files[0]) scanReceipt(e.target.files[0]); });

  // Settings
  document.getElementById('themeSelect').addEventListener('change', e => { S.theme = e.target.value; applySettings(); saveState(); });
  document.getElementById('densitySelect').addEventListener('change', e => { S.density = e.target.value; applySettings(); saveState(); });
  document.getElementById('fontSizeSelect').addEventListener('change', e => { S.fontSize = e.target.value; applySettings(); saveState(); });
  document.getElementById('langSelect').addEventListener('change', e => { S.language = e.target.value; applySettings(); saveState(); applyTranslations(); });
  document.getElementById('dateFormatSelect').addEventListener('change', e => { S.dateFormat = e.target.value; saveState(); renderTransactionTable(); });
  document.getElementById('numberFormatSelect').addEventListener('change', e => { S.numberFormat = e.target.value; saveState(); render(); });
  document.getElementById('savePinBtn').addEventListener('click', savePIN);
  document.getElementById('removePinBtn').addEventListener('click', () => { S.pin = null; saveState(); toast('PIN removed','success'); });
  document.getElementById('saveSecurityBtn').addEventListener('click', saveSecuritySettings);
  document.getElementById('addProfileBtn').addEventListener('click', addProfile);
  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('restoreInput').addEventListener('change', e => { if (e.target.files[0]) restoreData(e.target.files[0]); });
  document.getElementById('printReportBtn').addEventListener('click', printReport);
  document.getElementById('activityLogBtn').addEventListener('click', showActivityLog);
  document.getElementById('clearDataBtn').addEventListener('click', clearData);
  document.getElementById('newCategoryBtn').addEventListener('click', () => modal('categoryModal', true));
  document.getElementById('saveCategoryBtn').addEventListener('click', saveCustomCategory);
  document.getElementById('saveApiKeyBtn').addEventListener('click', () => { S.aiApiKey = document.getElementById('aiApiKeyInput').value.trim(); saveState(); toast('API key saved','success'); });
  document.getElementById('requestNotifBtn').addEventListener('click', requestNotifPermission);
  document.getElementById('notifBills').addEventListener('change', e => { S.notifBills = e.target.checked; saveState(); });
  document.getElementById('notifBudget').addEventListener('change', e => { S.notifBudget = e.target.checked; saveState(); });
  document.getElementById('notifGoals').addEventListener('change', e => { S.notifGoals = e.target.checked; saveState(); });

  // Modal closes
  document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => modal(btn.dataset.modal, false)));
  document.querySelectorAll('.modal-overlay').forEach(el => el.addEventListener('click', e => { if (e.target === el) modal(el.id, false); }));

  // PIN overlay
  document.querySelectorAll('.pin-key').forEach(btn => btn.addEventListener('click', () => handlePIN(btn.dataset.k)));
}

// ════════════════════════════════════════════
// POPULATE SELECTS
// ════════════════════════════════════════════
function populateAllSelects() {
  const codes = Object.keys(rates).length ? Object.keys(rates).sort() : ['GBP','USD','EUR','JPY'];
  ['displayCurrency','txCurrency','convFrom','convTo','walletCurrency','billCurrency','alertFrom','alertTo','invCurrency'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value || S.displayCurrency;
    el.innerHTML = codes.map(c => `<option value="${c}">${c}</option>`).join('');
    el.value = codes.includes(cur) ? cur : S.displayCurrency;
  });

  // PPP selects
  ['pppFrom','pppTo'].forEach((id,i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = Object.entries(PPP_DATA).map(([c,d]) => `<option value="${c}">${c} — ${d.name}</option>`).join('');
    el.value = i === 0 ? S.displayCurrency : 'USD';
  });

  document.getElementById('displayCurrency').value = S.displayCurrency;
  document.getElementById('displayCurrLabel').textContent = S.displayCurrency;
  document.getElementById('baseLabel').textContent = S.displayCurrency;
  populateCategorySelects();
  populateProfileSelects();
  populateAnalyticsYears();
}

function populateCategorySelects() {
  const cats = allCats();
  ['txCategory','filterCategory','billCategory','drillCategory'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const expOnly = ['billCategory'].includes(id);
    const options = cats.filter(c => !expOnly || c.type !== 'income').map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    if (id === 'filterCategory') el.innerHTML = '<option value="">All Categories</option>' + options;
    else el.innerHTML = options;
  });
}

function populateProfileSelects() {
  const el = document.getElementById('profileSelect');
  el.innerHTML = S.profiles.map(p => `<option value="${p}">${p}</option>`).join('');
  el.value = S.profile;
  renderProfileList();
}

function populateAnalyticsYears() {
  const el = document.getElementById('analyticsYear');
  const years = new Set(S.transactions.map(t => t.date?.slice(0,4)).filter(Boolean));
  const cur = new Date().getFullYear().toString();
  years.add(cur);
  el.innerHTML = [...years].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('');
  el.value = cur;
}

// ════════════════════════════════════════════
// APPLY SETTINGS
// ════════════════════════════════════════════
function applySettings() {
  const html = document.documentElement;
  html.dataset.theme   = S.theme;
  html.dataset.density = S.density;
  html.dataset.fontsize= S.fontSize;
  html.dir = S.language === 'ar' ? 'rtl' : 'ltr';
  html.lang = S.language;

  // Accent colour CSS variable
  document.documentElement.style.setProperty('--accent', S.accentColor);

  // Sync settings UI
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('themeSelect', S.theme); setVal('densitySelect', S.density);
  setVal('fontSizeSelect', S.fontSize); setVal('langSelect', S.language);
  setVal('dateFormatSelect', S.dateFormat); setVal('numberFormatSelect', S.numberFormat);
  setVal('sessionTimeoutInput', S.sessionTimeout); setVal('lowBalThreshold', S.lowBalThreshold);
  setVal('aiApiKeyInput', S.aiApiKey);

  const setCb = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  setCb('notifBills', S.notifBills); setCb('notifBudget', S.notifBudget); setCb('notifGoals', S.notifGoals);

  renderColorSwatches();
}

function renderColorSwatches() {
  const el = document.getElementById('colorSwatches');
  if (!el) return;
  el.innerHTML = ACCENTS.map(c => `<button class="swatch ${c===S.accentColor?'active':''}" style="background:${c}" data-color="${c}" aria-label="Accent ${c}"></button>`).join('');
  el.querySelectorAll('.swatch').forEach(sw => sw.addEventListener('click', () => {
    S.accentColor = sw.dataset.color;
    document.documentElement.style.setProperty('--accent', S.accentColor);
    saveState(); renderColorSwatches();
  }));
}

function applyTranslations() {
  const t = LANGS[S.language] || LANGS.en;
  document.querySelectorAll('[data-tab]').forEach(btn => {
    const key = btn.dataset.tab;
    if (t[key]) { const span = btn.querySelector('span'); if (span) span.textContent = ' '+t[key]; }
  });
}

// ════════════════════════════════════════════
// RECURRING TRANSACTIONS
// ════════════════════════════════════════════
function processRecurring() {
  const now = new Date();
  let added = false;
  S.transactions.filter(t => t.recurring && t.recurring !== 'none').forEach(t => {
    const last = new Date(t.lastGenerated || t.date);
    let next = new Date(last);
    let limit = 0;
    while (limit++ < 365) {
      if (t.recurring === 'weekly')  next.setDate(next.getDate() + 7);
      if (t.recurring === 'monthly') next.setMonth(next.getMonth() + 1);
      if (t.recurring === 'yearly')  next.setFullYear(next.getFullYear() + 1);
      if (next > now) break;
      const dateStr = next.toISOString().split('T')[0];
      const exists = S.transactions.some(tx => tx.recurringParent === t.id && tx.date === dateStr);
      if (!exists) {
        S.transactions.push({...t, id: Date.now() + Math.random(), date: dateStr, recurring: 'none', recurringParent: t.id, lastGenerated: undefined});
        t.lastGenerated = dateStr;
        added = true;
      }
    }
  });
  if (added) { saveState(); }
}

// ════════════════════════════════════════════
// TRANSACTIONS
// ════════════════════════════════════════════
function addTransaction(splitItems) {
  const type     = document.getElementById('txType').value;
  const desc     = document.getElementById('txDesc').value.trim();
  const catId    = document.getElementById('txCategory').value;
  const amount   = parseFloat(document.getElementById('txAmount').value);
  const currency = document.getElementById('txCurrency').value;
  const date     = document.getElementById('txDate').value;
  const tags     = document.getElementById('txTags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const recurring= document.getElementById('txRecurring').value;

  if (!desc) { toast('Enter a description','error'); return; }
  if (!amount || amount <= 0) { toast('Enter a valid amount','error'); return; }
  if (!date) { toast('Select a date','error'); return; }

  pushUndo();

  if (splitItems && splitItems.length) {
    splitItems.forEach(si => {
      S.transactions.push({id:Date.now()+Math.random(), type, desc:`${desc} (${si.cat})`, category:si.catId, amount:si.amount, currency, date, tags, recurring, lastGenerated: date, splitGroup: Date.now()});
    });
  } else {
    S.transactions.push({id:Date.now(), type, desc, category:catId, amount, currency, date, tags, recurring, lastGenerated: date});
  }

  saveState();
  pushActivity(`Added transaction: ${desc} ${fmt(amount, currency)}`);
  checkBudgetAlerts();

  // Clear form
  document.getElementById('txDesc').value = '';
  document.getElementById('txAmount').value = '';
  document.getElementById('txTags').value = '';
  document.getElementById('txDate').value = today();

  render();
  toast('Transaction added','success');
}

function deleteTransaction(id) {
  pushUndo();
  S.transactions = S.transactions.filter(t => t.id !== id);
  saveState();
  render();
  toast('Deleted','info');
}

function bulkDelete() {
  const checked = [...document.querySelectorAll('.tx-cb:checked')].map(cb => cb.dataset.id);
  if (!checked.length) { toast('Select transactions first','info'); return; }
  if (!confirm(`Delete ${checked.length} transaction(s)?`)) return;
  pushUndo();
  S.transactions = S.transactions.filter(t => !checked.includes(String(t.id)));
  saveState(); render(); toast(`Deleted ${checked.length} transactions`,'success');
}

// Split Transaction
function openSplitModal() {
  const amount = parseFloat(document.getElementById('txAmount').value);
  if (!amount || amount <= 0) { toast('Enter an amount first','error'); return; }
  pendingSplitData = { total: amount, rows: [] };
  document.getElementById('splitTotal').textContent = fmt(amount, document.getElementById('txCurrency').value);
  document.getElementById('splitRows').innerHTML = '';
  addSplitRow(); addSplitRow();
  modal('splitModal', true);
  updateSplitRemaining();
}

function addSplitRow() {
  const cats = allCats();
  const row = document.createElement('div');
  row.className = 'split-row';
  row.innerHTML = `
    <select class="split-cat">${cats.filter(c=>c.type!=='income').map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select>
    <input type="number" class="split-amt" placeholder="0.00" min="0" step="0.01"/>
    <button class="delete-btn" onclick="this.parentElement.remove();updateSplitRemaining()">✕</button>`;
  row.querySelector('.split-amt').addEventListener('input', updateSplitRemaining);
  document.getElementById('splitRows').appendChild(row);
}

function updateSplitRemaining() {
  const total = parseFloat(document.getElementById('splitTotal').textContent.replace(/[^0-9.]/g,'')) || 0;
  const used = [...document.querySelectorAll('.split-amt')].reduce((s,el) => s + (parseFloat(el.value)||0), 0);
  const rem = total - used;
  const el = document.getElementById('splitRemaining');
  el.textContent = `Remaining: ${rem.toFixed(2)}`;
  el.style.color = Math.abs(rem) < 0.01 ? 'var(--green)' : 'var(--yellow)';
}

function confirmSplit() {
  const total = parseFloat(document.getElementById('txAmount').value);
  const rows  = [...document.querySelectorAll('.split-row')];
  const items = rows.map(r => ({ catId: r.querySelector('.split-cat').value, cat: r.querySelector('.split-cat').selectedOptions[0].text, amount: parseFloat(r.querySelector('.split-amt').value)||0 }));
  const sum = items.reduce((s,i)=>s+i.amount,0);
  if (Math.abs(sum-total)>0.01) { toast('Splits must add up to total','error'); return; }
  modal('splitModal', false);
  addTransaction(items);
}

// Import CSV
function importCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    let count = 0;
    pushUndo();
    lines.slice(1).forEach(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g,''));
      const row = {};
      headers.forEach((h,i) => row[h] = vals[i]);
      if (!row.description || !row.amount) return;
      S.transactions.push({
        id: Date.now()+Math.random(), type: row.type||'expense',
        desc: row.description, category: row.category||'other',
        amount: parseFloat(row.amount)||0, currency: row.currency||S.displayCurrency,
        date: row.date||today(), tags: [], recurring: 'none', lastGenerated: row.date||today()
      });
      count++;
    });
    saveState(); render(); toast(`Imported ${count} transactions`,'success');
    pushActivity(`Imported ${count} transactions from CSV`);
  };
  reader.readAsText(file);
}

// Export CSV
function exportCSV() {
  const headers = 'Date,Type,Description,Category,Amount,Currency,Tags\n';
  const rows = S.transactions.map(t => `${t.date},${t.type},"${t.desc}",${catById(t.category).name},${t.amount},${t.currency},"${(t.tags||[]).join('|')}"`).join('\n');
  download(`budgetflow_${S.profile}_${today()}.csv`, headers+rows, 'text/csv');
  toast('CSV exported','success');
}

function download(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type:mime}));
  a.download = name; a.click();
}

// ════════════════════════════════════════════
// SAVINGS GOALS
// ════════════════════════════════════════════
function addGoal() {
  const name   = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved  = parseFloat(document.getElementById('goalSaved').value)||0;
  const date   = document.getElementById('goalDate').value;
  const icon   = document.getElementById('goalIcon').value||'🎯';
  if (!name||!target) { toast('Fill in name and target','error'); return; }
  pushUndo();
  S.savingsGoals.push({id:Date.now(), name, target, saved, date, icon});
  saveState(); renderGoals(); toast('Goal added','success');
  document.getElementById('goalName').value=''; document.getElementById('goalTarget').value=''; document.getElementById('goalSaved').value=''; document.getElementById('goalDate').value='';
}

function updateGoal(id, amount) {
  const g = S.savingsGoals.find(g=>g.id===id);
  if (!g) return;
  g.saved = Math.min(g.saved + amount, g.target);
  saveState(); renderGoals();
  if (g.saved >= g.target) { toast(`🎉 Goal "${g.name}" completed!`,'success'); sendNotification('Goal Achieved!',`You've reached your goal: ${g.name}`); }
  else if (S.notifGoals && g.saved/g.target >= .75 && g.saved/g.target < .8) sendNotification('Goal Progress',`${g.name}: 75% reached!`);
}

function renderGoals() {
  const el = document.getElementById('goalsList');
  if (!S.savingsGoals.length) { el.innerHTML = '<p class="no-data">No savings goals yet.</p>'; return; }
  el.innerHTML = S.savingsGoals.map(g => {
    const pct = Math.min((g.saved/g.target)*100,100);
    const daysLeft = g.date ? Math.max(0,Math.ceil((new Date(g.date)-new Date())/86400000)) : null;
    const monthsNeeded = g.target-g.saved > 0 && daysLeft > 0 ? Math.ceil((g.target-g.saved)/(daysLeft/30)) : null;
    return `<div class="goal-card">
      <div class="goal-header"><span class="goal-name">${g.icon} ${g.name}</span><button class="delete-btn" onclick="deleteGoal(${g.id})">🗑</button></div>
      <div class="goal-amounts"><span>${fmt(g.saved,S.displayCurrency)} saved</span><span>Target: ${fmt(g.target,S.displayCurrency)}</span></div>
      <div class="progress-track"><div class="progress-fill ${pct>=100?'ok':pct>=50?'warn':'over'}" style="width:${pct}%"></div></div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-top:.4rem;display:flex;justify-content:space-between">
        <span>${pct.toFixed(1)}% complete</span>
        ${daysLeft!==null?`<span>${daysLeft} days left${monthsNeeded?` · ~${fmt(monthsNeeded,S.displayCurrency)}/mo`:''}` : ''}
      </div>
      <div style="display:flex;gap:.4rem;margin-top:.6rem">
        <button class="btn-ghost" onclick="updateGoal(${g.id},${g.target*0.1})" style="font-size:.75rem;padding:.25rem .5rem">+10%</button>
        <button class="btn-ghost" onclick="updateGoal(${g.id},prompt('Add amount:')*1||0)" style="font-size:.75rem;padding:.25rem .5rem">+ Custom</button>
      </div>
    </div>`;
  }).join('');
}

function deleteGoal(id) { pushUndo(); S.savingsGoals=S.savingsGoals.filter(g=>g.id!==id); saveState(); renderGoals(); }

// ════════════════════════════════════════════
// DEBTS
// ════════════════════════════════════════════
function addDebt() {
  const name    = document.getElementById('debtName').value.trim();
  const total   = parseFloat(document.getElementById('debtTotal').value);
  const rate    = parseFloat(document.getElementById('debtRate').value)||0;
  const payment = parseFloat(document.getElementById('debtPayment').value);
  const type    = document.getElementById('debtType').value;
  if (!name||!total) { toast('Fill in name and balance','error'); return; }
  pushUndo();
  S.debts.push({id:Date.now(), name, total, balance:total, rate, payment, type});
  saveState(); renderDebts(); toast('Debt added','success');
  ['debtName','debtTotal','debtRate','debtPayment'].forEach(id => document.getElementById(id).value='');
}

function calcPayoff(debt) {
  if (!debt.payment || debt.payment <= 0) return {months:null, totalInterest:null};
  const monthlyRate = debt.rate / 100 / 12;
  if (monthlyRate === 0) { const m = Math.ceil(debt.balance/debt.payment); return {months:m, totalInterest:0}; }
  const m = Math.ceil(-Math.log(1 - (debt.balance * monthlyRate) / debt.payment) / Math.log(1 + monthlyRate));
  if (!isFinite(m) || m <= 0) return {months:null, totalInterest:null};
  const totalInterest = (debt.payment * m) - debt.balance;
  return {months:m, totalInterest: Math.max(0, totalInterest)};
}

function renderDebts() {
  const el = document.getElementById('debtsList');
  if (!S.debts.length) { el.innerHTML = '<p class="no-data">No debts tracked.</p>'; return; }
  el.innerHTML = S.debts.map(d => {
    const {months, totalInterest} = calcPayoff(d);
    const typeIcons = {credit_card:'💳',loan:'🏦',mortgage:'🏠',other:'📄'};
    return `<div class="debt-card">
      <div class="debt-header"><span class="goal-name">${typeIcons[d.type]||'💳'} ${d.name}</span><button class="delete-btn" onclick="deleteDebt(${d.id})">🗑</button></div>
      <div style="font-size:.85rem;display:flex;gap:1rem;flex-wrap:wrap">
        <span>Balance: <strong>${fmt(d.balance,S.displayCurrency)}</strong></span>
        <span>Rate: ${d.rate}%</span>
        <span>Payment: ${fmt(d.payment||0,S.displayCurrency)}/mo</span>
      </div>
      ${months?`<div class="debt-payoff">Payoff: ~${months} months (${(months/12).toFixed(1)} yrs) · Total interest: ${fmt(totalInterest,S.displayCurrency)}</div>`:'<div class="debt-payoff" style="color:var(--yellow)">Set a payment amount for payoff projection</div>'}
      <div style="margin-top:.6rem">
        <div class="progress-track"><div class="progress-fill ok" style="width:${Math.min(100,((d.total-d.balance)/d.total)*100)}%"></div></div>
        <div style="font-size:.72rem;color:var(--text-muted);margin-top:.25rem">${(((d.total-d.balance)/d.total)*100).toFixed(1)}% paid off</div>
      </div>
    </div>`;
  }).join('');
}

function deleteDebt(id) { pushUndo(); S.debts=S.debts.filter(d=>d.id!==id); saveState(); renderDebts(); }

// ════════════════════════════════════════════
// NET WORTH
// ════════════════════════════════════════════
function addAsset() {
  const name = document.getElementById('assetName').value.trim();
  const val  = parseFloat(document.getElementById('assetValue').value);
  const cat  = document.getElementById('assetCat').value;
  if (!name||!val) { toast('Fill in name and value','error'); return; }
  pushUndo(); S.assets.push({id:Date.now(),name,value:val,category:cat,currency:S.displayCurrency});
  saveState(); renderNetWorth(); document.getElementById('assetName').value=''; document.getElementById('assetValue').value='';
}

function addLiability() {
  const name = document.getElementById('liabName').value.trim();
  const val  = parseFloat(document.getElementById('liabValue').value);
  const cat  = document.getElementById('liabCat').value;
  if (!name||!val) { toast('Fill in name and value','error'); return; }
  pushUndo(); S.liabilities.push({id:Date.now(),name,value:val,category:cat,currency:S.displayCurrency});
  saveState(); renderNetWorth(); document.getElementById('liabName').value=''; document.getElementById('liabValue').value='';
}

function addInvestment() {
  const name = document.getElementById('invName').value.trim();
  const qty  = parseFloat(document.getElementById('invQty').value);
  const buy  = parseFloat(document.getElementById('invBuy').value);
  const cur  = parseFloat(document.getElementById('invCurrent').value);
  const curr = document.getElementById('invCurrency').value;
  if (!name||!qty) { toast('Fill in name and quantity','error'); return; }
  pushUndo(); S.investments.push({id:Date.now(),name,qty,buyPrice:buy||0,currentPrice:cur||0,currency:curr});
  saveState(); renderNetWorth(); document.getElementById('invName').value=''; document.getElementById('invQty').value=''; document.getElementById('invBuy').value=''; document.getElementById('invCurrent').value='';
}

function renderNetWorth() {
  const totalAssets = S.assets.reduce((s,a) => s+convert(a.value,a.currency||S.displayCurrency,S.displayCurrency),0)
    + S.investments.reduce((s,i) => s+convert(i.qty*i.currentPrice,i.currency||S.displayCurrency,S.displayCurrency),0);
  const totalLiabs  = S.liabilities.reduce((s,l) => s+convert(l.value,l.currency||S.displayCurrency,S.displayCurrency),0)
    + S.debts.reduce((s,d) => s+convert(d.balance,S.displayCurrency,S.displayCurrency),0);
  const nw = totalAssets - totalLiabs;

  document.getElementById('totalAssets').textContent      = fmt(totalAssets, S.displayCurrency);
  document.getElementById('totalLiabilities').textContent = fmt(totalLiabs, S.displayCurrency);
  document.getElementById('netWorthValue').textContent    = fmt(nw, S.displayCurrency);
  document.getElementById('dashNetWorth').textContent     = fmt(nw, S.displayCurrency);

  document.getElementById('assetsList').innerHTML = S.assets.length
    ? S.assets.map(a=>`<div class="nw-item"><span>${a.name} <small style="color:var(--text-muted)">(${a.category})</small></span><span>${fmt(a.value,a.currency)}<button class="delete-btn" onclick="deleteAsset(${a.id})">🗑</button></span></div>`).join('')
    : '<p class="no-data">No assets.</p>';

  document.getElementById('liabsList').innerHTML = S.liabilities.length
    ? S.liabilities.map(l=>`<div class="nw-item"><span>${l.name}</span><span style="color:var(--red)">${fmt(l.value,l.currency)}<button class="delete-btn" onclick="deleteLiab(${l.id})">🗑</button></span></div>`).join('')
    : '<p class="no-data">No liabilities.</p>';

  document.getElementById('invList').innerHTML = S.investments.length
    ? `<div style="overflow-x:auto"><table style="width:100%;font-size:.83rem"><thead><tr><th>Name</th><th>Qty</th><th>Buy</th><th>Current</th><th>Value</th><th>P&L</th><th></th></tr></thead><tbody>`
    + S.investments.map(i => {
        const val = i.qty*i.currentPrice, cost=i.qty*i.buyPrice, pl=val-cost, pct=cost?((pl/cost)*100).toFixed(1):'—';
        return `<tr><td>${i.name}</td><td>${i.qty}</td><td>${fmt(i.buyPrice,i.currency)}</td><td>${fmt(i.currentPrice,i.currency)}</td><td>${fmt(val,i.currency)}</td><td class="${pl>=0?'gain':'loss'}">${pl>=0?'+':''}${fmt(pl,i.currency)} (${pct}%)</td><td><button class="delete-btn" onclick="deleteInv(${i.id})">🗑</button></td></tr>`;
      }).join('')+'</tbody></table></div>'
    : '<p class="no-data">No investments.</p>';
}

function deleteAsset(id) { pushUndo(); S.assets=S.assets.filter(a=>a.id!==id); saveState(); renderNetWorth(); }
function deleteLiab(id)  { pushUndo(); S.liabilities=S.liabilities.filter(l=>l.id!==id); saveState(); renderNetWorth(); }
function deleteInv(id)   { pushUndo(); S.investments=S.investments.filter(i=>i.id!==id); saveState(); renderNetWorth(); }

// ════════════════════════════════════════════
// BILLS
// ════════════════════════════════════════════
function addBill() {
  const name   = document.getElementById('billName').value.trim();
  const amount = parseFloat(document.getElementById('billAmount').value);
  const curr   = document.getElementById('billCurrency').value;
  const day    = parseInt(document.getElementById('billDay').value);
  const cat    = document.getElementById('billCategory').value;
  const freq   = document.getElementById('billFreq').value;
  if (!name||!amount||!day) { toast('Fill all bill fields','error'); return; }
  pushUndo(); S.bills.push({id:Date.now(),name,amount,currency:curr,day,category:cat,frequency:freq});
  saveState(); renderBills(); toast('Bill added','success');
  document.getElementById('billName').value=''; document.getElementById('billAmount').value=''; document.getElementById('billDay').value='';
}

function renderBills() {
  const el = document.getElementById('billsList');
  if (!S.bills.length) { el.innerHTML = '<p class="no-data">No bills added.</p>'; return; }
  const now = new Date();
  const bills = S.bills.map(b => {
    let next = new Date(now.getFullYear(), now.getMonth(), b.day);
    if (next <= now) next.setMonth(next.getMonth()+1);
    const daysUntil = Math.ceil((next-now)/86400000);
    const status = daysUntil <= 0 ? 'overdue' : daysUntil <= 7 ? 'due-soon' : 'ok';
    const label  = daysUntil <= 0 ? 'OVERDUE' : daysUntil <= 7 ? `${daysUntil}d` : `${daysUntil}d`;
    return {...b, next, daysUntil, status, label};
  }).sort((a,b)=>a.daysUntil-b.daysUntil);

  el.innerHTML = bills.map(b => `
    <div class="bill-item">
      <div class="bill-info">
        <div class="bill-name">${b.name}</div>
        <div class="bill-meta">Due day ${b.day} · ${b.frequency} · ${catById(b.category).icon} ${catById(b.category).name}</div>
      </div>
      <span style="font-weight:600">${fmt(b.amount,b.currency)}</span>
      <span class="badge ${b.status}">${b.label}</span>
      <button class="delete-btn" onclick="deleteBill(${b.id})">🗑</button>
    </div>`).join('');
}

function deleteBill(id) { pushUndo(); S.bills=S.bills.filter(b=>b.id!==id); saveState(); renderBills(); }

// ════════════════════════════════════════════
// CURRENCY
// ════════════════════════════════════════════
function updateConverter() {
  const amount = parseFloat(document.getElementById('convAmount').value)||0;
  const from   = document.getElementById('convFrom').value;
  const to     = document.getElementById('convTo').value;
  const result = convert(amount, from, to);
  const rate   = convert(1, from, to);
  document.getElementById('convResult').textContent = fmt(result, to);
  document.getElementById('convRate').textContent   = `1 ${from} = ${rate.toFixed(6)} ${to}`;
  renderComparison();
}

function renderComparison() {
  const from = document.getElementById('convFrom').value;
  const amt  = parseFloat(document.getElementById('convAmount').value)||1;
  document.getElementById('compareFrom').textContent = `${amt} ${from}`;
  const popular = ['GBP','USD','EUR','JPY','AUD','CAD','CHF','CNY','INR','MXN','SGD','HKD','BRL','ZAR'];
  document.getElementById('compareGrid').innerHTML = popular.filter(c=>c!==from).map(c => {
    const val = convert(amt, from, c);
    return `<div class="rate-item"><span class="rate-code">${c}</span><span class="rate-val">${val.toFixed(4)}</span></div>`;
  }).join('');
}

function renderRatesGrid() {
  const search = (document.getElementById('searchRate')?.value||'').toUpperCase();
  const codes  = Object.keys(rates).sort().filter(c => !search || c.includes(search));
  document.getElementById('ratesGrid').innerHTML = codes.map(c => {
    const val = convert(1, S.displayCurrency, c);
    return `<div class="rate-item"><span class="rate-code">${c}</span><span class="rate-val">${val.toFixed(4)}</span></div>`;
  }).join('');
}

function addWalletBalance() {
  const curr = document.getElementById('walletCurrency').value;
  const bal  = parseFloat(document.getElementById('walletBalance').value);
  if (!bal) { toast('Enter a balance','error'); return; }
  S.wallet[curr] = bal;
  saveState(); renderWallet(); document.getElementById('walletBalance').value='';
  toast('Wallet updated','success');
}

function renderWallet() {
  const el = document.getElementById('walletList');
  const entries = Object.entries(S.wallet);
  if (!entries.length) { el.innerHTML = '<p class="no-data">No wallet balances.</p>'; return; }
  const totalInDisplay = entries.reduce((s,[c,v])=>s+convert(v,c,S.displayCurrency),0);
  el.innerHTML = entries.map(([c,v]) => {
    const inDisp = convert(v,c,S.displayCurrency);
    return `<div class="wallet-item"><span><strong>${c}</strong> ${fmt(v,c)}</span><span style="color:var(--text-muted)">${fmt(inDisp,S.displayCurrency)}</span><button class="delete-btn" onclick="deleteWallet('${c}')">🗑</button></div>`;
  }).join('') + `<div class="wallet-item" style="font-weight:600"><span>Total</span><span>${fmt(totalInDisplay,S.displayCurrency)}</span></div>`;
}

function deleteWallet(c) { delete S.wallet[c]; saveState(); renderWallet(); }

function saveRateAlert() {
  const from = document.getElementById('alertFrom').value;
  const to   = document.getElementById('alertTo').value;
  const cond = document.getElementById('alertCond').value;
  const tgt  = parseFloat(document.getElementById('alertTarget').value);
  if (!tgt) { toast('Enter a target rate','error'); return; }
  S.rateAlerts.push({id:Date.now(),from,to,condition:cond,target:tgt,triggered:false});
  saveState(); renderRateAlerts(); modal('rateAlertModal',false); toast('Alert saved','success');
}

function renderRateAlerts() {
  const el = document.getElementById('alertsList');
  if (!S.rateAlerts.length) { el.innerHTML='<p class="no-data">No rate alerts set.</p>'; return; }
  el.innerHTML = S.rateAlerts.map(a => {
    const cur = convert(1,a.from,a.to);
    const hit = a.condition==='above'?cur>a.target:cur<a.target;
    return `<div class="wallet-item"><span>${a.from}→${a.to}: ${a.condition} ${a.target} <small style="color:var(--text-muted)">(now: ${cur.toFixed(4)})</small></span><span class="badge ${hit?'ok':'expense'}">${hit?'✓ HIT':'Watching'}</span><button class="delete-btn" onclick="deleteAlert(${a.id})">🗑</button></div>`;
  }).join('');
}

function deleteAlert(id) { S.rateAlerts=S.rateAlerts.filter(a=>a.id!==id); saveState(); renderRateAlerts(); }

function checkRateAlerts() {
  S.rateAlerts.filter(a=>!a.triggered).forEach(a => {
    const cur = convert(1,a.from,a.to);
    const hit = a.condition==='above'?cur>a.target:cur<a.target;
    if (hit) { a.triggered = true; sendNotification('Rate Alert!',`${a.from}→${a.to} is now ${cur.toFixed(4)} (${a.condition} ${a.target})`); toast(`Rate alert hit: ${a.from}→${a.to}`,'success'); saveState(); }
  });
}

function renderPPP() {
  const amount = parseFloat(document.getElementById('pppAmount').value)||100;
  const from   = document.getElementById('pppFrom').value;
  const to     = document.getElementById('pppTo').value;
  if (!PPP_DATA[from]||!PPP_DATA[to]) return;
  const pppRate = PPP_DATA[to].bm / PPP_DATA[from].bm;
  const result  = amount * pppRate;
  document.getElementById('pppResult').textContent = `${fmt(result,to)} equivalent purchasing power`;
  document.getElementById('pppNote').textContent = `Based on Big Mac Index: 1 ${from} ≈ ${pppRate.toFixed(4)} ${to} in purchasing power`;
}

// ════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════
function render() {
  renderSummaryCards();
  renderDashboardCharts();
  renderBudgetProgress();
  renderForecast();
  renderBiggestExpenses();
  renderSpendingStreak();
  renderAlertsBanner();
  renderTransactionTable();
  populateTagFilter();
  updateConverter();
}

function getExpenseInDisplay() {
  const exp = {};
  S.transactions.filter(t=>t.type==='expense').forEach(t => {
    const v = convert(t.amount, t.currency, S.displayCurrency);
    exp[t.category] = (exp[t.category]||0) + v;
  });
  return exp;
}

function renderSummaryCards() {
  let income=0, expenses=0;
  S.transactions.forEach(t => {
    const v = convert(t.amount, t.currency, S.displayCurrency);
    if (t.type==='income') income+=v; else expenses+=v;
  });
  const net = income-expenses;
  document.getElementById('totalIncome').textContent   = fmt(income, S.displayCurrency);
  document.getElementById('totalExpenses').textContent = fmt(expenses, S.displayCurrency);
  document.getElementById('netBalance').textContent    = fmt(net, S.displayCurrency);
  const card = document.getElementById('balanceCard');
  card.className = `card blue ${net>=0?'surplus':'deficit'}`;
}

function renderAlertsBanner() {
  const banners = [];
  const now = new Date();

  // Overdue bills
  if (S.notifBills) {
    S.bills.forEach(b => {
      let next = new Date(now.getFullYear(), now.getMonth(), b.day);
      if (next <= now) { banners.push(`<div class="alert-item">⚠️ ${b.name} is overdue (due day ${b.day})</div>`); return; }
      const days = Math.ceil((next-now)/86400000);
      if (days <= 3) banners.push(`<div class="alert-item warn">🔔 ${b.name} due in ${days} day(s) — ${fmt(b.amount,b.currency)}</div>`);
    });
  }

  // Low balance
  if (S.lowBalThreshold > 0) {
    let income=0, expenses=0;
    S.transactions.forEach(t => {
      const v = convert(t.amount,t.currency,S.displayCurrency);
      if(t.type==='income')income+=v; else expenses+=v;
    });
    if (income-expenses < S.lowBalThreshold) banners.push(`<div class="alert-item">⚠️ Balance below ${fmt(S.lowBalThreshold,S.displayCurrency)} threshold</div>`);
  }

  document.getElementById('alertsBanner').innerHTML = banners.join('');
}

function renderForecast() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const dayOfMonth  = now.getDate();
  const daysLeft    = daysInMonth - dayOfMonth;

  const monthTxs = S.transactions.filter(t => { const d=new Date(t.date); return d.getFullYear()===y&&d.getMonth()===m; });
  let monthIncome=0, monthExpenses=0;
  monthTxs.forEach(t => {
    const v = convert(t.amount,t.currency,S.displayCurrency);
    if(t.type==='income')monthIncome+=v; else monthExpenses+=v;
  });

  const dailySpend = dayOfMonth > 0 ? monthExpenses/dayOfMonth : 0;
  const projExpenses = monthExpenses + dailySpend*daysLeft;
  const projBalance  = monthIncome - projExpenses;

  document.getElementById('forecastCard').innerHTML = `
    <div class="forecast-row"><span>Income so far</span><span style="color:var(--green)">${fmt(monthIncome,S.displayCurrency)}</span></div>
    <div class="forecast-row"><span>Expenses so far</span><span style="color:var(--red)">${fmt(monthExpenses,S.displayCurrency)}</span></div>
    <div class="forecast-row"><span>Daily average spend</span><span>${fmt(dailySpend,S.displayCurrency)}</span></div>
    <div class="forecast-row"><span>Days remaining</span><span>${daysLeft}</span></div>
    <div class="forecast-row"><span>Projected total expenses</span><span style="color:var(--red)">${fmt(projExpenses,S.displayCurrency)}</span></div>
    <div class="forecast-row"><span>Projected month balance</span><span style="color:${projBalance>=0?'var(--green)':'var(--red)'}">${fmt(projBalance,S.displayCurrency)}</span></div>`;
}

function renderBiggestExpenses() {
  const now = new Date();
  const txs = S.transactions.filter(t => { const d=new Date(t.date); return t.type==='expense'&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth(); })
    .map(t => ({...t, inDisp: convert(t.amount,t.currency,S.displayCurrency)}))
    .sort((a,b)=>b.inDisp-a.inDisp).slice(0,5);
  document.getElementById('biggestExpenses').innerHTML = txs.length
    ? txs.map(t=>`<div class="highlight-item"><span>${catById(t.category).icon} ${t.desc}</span><span style="color:var(--red)">${fmt(t.inDisp,S.displayCurrency)}</span></div>`).join('')
    : '<p class="no-data">No expenses this month.</p>';
}

function renderSpendingStreak() {
  const exp = S.transactions.filter(t=>t.type==='expense');
  if (!exp.length) { document.getElementById('spendingStreak').innerHTML='<p class="no-data">No data yet.</p>'; return; }
  const totals = {};
  exp.forEach(t => { totals[t.date]=(totals[t.date]||0)+convert(t.amount,t.currency,S.displayCurrency); });
  const days = Object.entries(totals).sort();
  const avg  = days.reduce((s,[,v])=>s+v,0)/days.length;
  let streak=0, best=0, cur=0;
  days.forEach(([,v])=>{ if(v<=avg){cur++;best=Math.max(best,cur);}else cur=0; });
  const today = totals[new Date().toISOString().split('T')[0]]||0;
  document.getElementById('spendingStreak').innerHTML = `
    <div class="streak-big">${best} 🔥</div>
    <div class="streak-sub">Best streak of under-average spend days</div>
    <div class="highlight-item" style="margin-top:.75rem"><span>Avg daily spend</span><span>${fmt(avg,S.displayCurrency)}</span></div>
    <div class="highlight-item"><span>Today's spend</span><span style="color:${today<=avg?'var(--green)':'var(--red)'}">${fmt(today,S.displayCurrency)}</span></div>`;
}

// ════════════════════════════════════════════
// CHARTS (Dashboard)
// ════════════════════════════════════════════
const CHART_PALETTE = ['#58a6ff','#3fb950','#f85149','#d29922','#bc8cff','#ff7b72','#ffa657','#56d364','#79c0ff','#ff9bce'];

function destroyChart(name) { if (charts[name]) { charts[name].destroy(); delete charts[name]; } }

function chartDefaults() {
  return { plugins:{ legend:{ labels:{ color:'var(--text-muted)||#8b949e', font:{size:11} } } }, animation:{duration:400} };
}

function renderDashboardCharts() {
  renderDonut();
  renderBarChart();
  renderCashFlow();
}

function renderDonut() {
  destroyChart('donut');
  const exp = getExpenseInDisplay();
  if (!Object.keys(exp).length) return;
  const labels = Object.keys(exp).map(id=>`${catById(id).icon} ${catById(id).name}`);
  charts.donut = new Chart(document.getElementById('donutChart').getContext('2d'), {
    type:'doughnut',
    data:{ labels, datasets:[{data:Object.values(exp), backgroundColor:CHART_PALETTE, borderWidth:2, borderColor:'rgba(0,0,0,0)'}] },
    options:{ ...chartDefaults(), cutout:'65%', onClick:(e,els)=>{ if(els.length){ const cat=Object.keys(exp)[els[0].index]; document.getElementById('drillCategory').value=cat; switchTab('analytics'); renderDrillChart(); } } }
  });
}

function renderBarChart() {
  destroyChart('bar');
  const months = {};
  S.transactions.forEach(t => {
    const m = t.date?.slice(0,7); if(!m) return;
    if(!months[m]) months[m]={income:0,expense:0};
    const v = convert(t.amount,t.currency,S.displayCurrency);
    months[m][t.type]+=v;
  });
  const labels = Object.keys(months).sort().slice(-6);
  charts.bar = new Chart(document.getElementById('barChart').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[
      {label:'Income',   data:labels.map(m=>months[m].income),   backgroundColor:'rgba(63,185,80,.7)',  borderRadius:4},
      {label:'Expenses', data:labels.map(m=>months[m].expense), backgroundColor:'rgba(248,81,73,.7)', borderRadius:4}
    ]},
    options:{ ...chartDefaults(), scales:{ x:{ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}}, y:{ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}} } }
  });
}

function renderCashFlow() {
  destroyChart('cashFlow');
  const sorted = [...S.transactions].sort((a,b)=>a.date?.localeCompare(b.date));
  if (!sorted.length) return;
  let bal=0;
  const data = sorted.map(t => { bal+=t.type==='income'?convert(t.amount,t.currency,S.displayCurrency):-convert(t.amount,t.currency,S.displayCurrency); return {x:t.date, y:parseFloat(bal.toFixed(2))}; });
  charts.cashFlow = new Chart(document.getElementById('cashFlowChart').getContext('2d'), {
    type:'line',
    data:{ datasets:[{label:'Balance', data, borderColor:'#58a6ff', backgroundColor:'rgba(88,166,255,.1)', fill:true, tension:.3, pointRadius:1}] },
    options:{ ...chartDefaults(), scales:{ x:{type:'category',ticks:{color:'#8b949e',maxTicksLimit:6},grid:{color:'rgba(48,54,61,.5)'}}, y:{ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}} }, plugins:{...chartDefaults().plugins, tooltip:{callbacks:{label:ctx=>`Balance: ${fmt(ctx.raw.y,S.displayCurrency)}`}}} }
  });
}

// ════════════════════════════════════════════
// BUDGET PROGRESS
// ════════════════════════════════════════════
function renderBudgetProgress() {
  const el = document.getElementById('budgetProgress');
  const cats = Object.keys(S.budgetLimits);
  if (!cats.length) { el.innerHTML='<p class="no-data">No limits set. Configure in Transactions → Budget Limits.</p>'; return; }
  const exp = getExpenseInDisplay();
  el.innerHTML = cats.map(cat => {
    const limit=S.budgetLimits[cat], spent=exp[cat]||0, pct=Math.min((spent/limit)*100,100);
    return `<div class="progress-item">
      <div class="progress-header"><span>${catById(cat).icon} ${catById(cat).name}</span><span>${fmt(spent,S.displayCurrency)} / ${fmt(limit,S.displayCurrency)}</span></div>
      <div class="progress-track"><div class="progress-fill ${pct>=100?'over':pct>=80?'warn':'ok'}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function checkBudgetAlerts() {
  if (!S.notifBudget) return;
  const exp = getExpenseInDisplay();
  Object.entries(S.budgetLimits).forEach(([cat,limit]) => {
    const spent = exp[cat]||0;
    if (spent >= limit) sendNotification('Over Budget!',`${catById(cat).name}: ${fmt(spent,S.displayCurrency)} vs limit ${fmt(limit,S.displayCurrency)}`);
    else if (spent/limit >= .8) toast(`⚠️ ${catById(cat).name} at ${((spent/limit)*100).toFixed(0)}% of budget`,'warning');
  });
}

// ════════════════════════════════════════════
// TRANSACTION TABLE
// ════════════════════════════════════════════
function renderTransactionTable() {
  const search  = (document.getElementById('searchTx')?.value||'').toLowerCase();
  const fType   = document.getElementById('filterType')?.value||'';
  const fCat    = document.getElementById('filterCategory')?.value||'';
  const fTag    = document.getElementById('filterTag')?.value||'';
  const fMonth  = document.getElementById('filterMonth')?.value||'';

  let txs = [...S.transactions].filter(t => {
    if (fType && t.type !== fType) return false;
    if (fCat  && t.category !== fCat) return false;
    if (fTag  && !(t.tags||[]).includes(fTag)) return false;
    if (fMonth && !t.date?.startsWith(fMonth)) return false;
    if (search && !t.desc?.toLowerCase().includes(search) && !t.category?.toLowerCase().includes(search)) return false;
    return true;
  }).sort((a,b)=>b.date?.localeCompare(a.date)||0);

  const body = document.getElementById('txBody');
  if (!txs.length) { body.innerHTML=`<tr><td colspan="10" class="empty-state">No transactions found.</td></tr>`; return; }

  body.innerHTML = txs.map(t => {
    const cat = catById(t.category);
    const inDisp = convert(t.amount, t.currency, S.displayCurrency);
    const tags = (t.tags||[]).map(tag=>`<span class="tag-chip">${tag}</span>`).join('');
    const recIcon = t.recurring&&t.recurring!=='none'?`<span title="${t.recurring}">🔄</span>`:'';
    return `<tr>
      <td><input type="checkbox" class="tx-cb" data-id="${t.id}"/></td>
      <td>${fmtDate(t.date)}</td>
      <td>${t.desc}</td>
      <td><span style="color:${cat.color}">${cat.icon} ${cat.name}</span></td>
      <td>${tags}</td>
      <td><span class="badge ${t.type}">${t.type}</span></td>
      <td>${fmt(t.amount, t.currency)}</td>
      <td>${fmt(inDisp, S.displayCurrency)}</td>
      <td>${recIcon} ${t.recurring&&t.recurring!=='none'?t.recurring:''}</td>
      <td><button class="delete-btn" onclick="deleteTransaction(${t.id})" aria-label="Delete">🗑</button></td>
    </tr>`;
  }).join('');
}

function populateTagFilter() {
  const tags = new Set(S.transactions.flatMap(t=>t.tags||[]));
  const el = document.getElementById('filterTag');
  const cur = el.value;
  el.innerHTML = '<option value="">All Tags</option>' + [...tags].sort().map(t=>`<option value="${t}">${t}</option>`).join('');
  if (cur && tags.has(cur)) el.value = cur;
}

// ════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════
function renderAnalytics() {
  const year = parseInt(document.getElementById('analyticsYear')?.value||new Date().getFullYear());
  renderStatsRow(year);
  renderTrendsChart(year);
  renderIncomeSourceChart(year);
  renderMoMChart(year);
  renderDrillChart();
}

function renderStatsRow(year) {
  const txs = S.transactions.filter(t => t.date?.startsWith(year));
  let income=0, expenses=0;
  txs.forEach(t => { const v=convert(t.amount,t.currency,S.displayCurrency); if(t.type==='income')income+=v; else expenses+=v; });
  const days = txs.length ? (new Date(Math.max(...txs.map(t=>new Date(t.date))))-new Date(Math.min(...txs.map(t=>new Date(t.date)))))/86400000+1 : 1;
  document.getElementById('statsRow').innerHTML = [
    {label:'Total Income', value:fmt(income,S.displayCurrency)},
    {label:'Total Expenses', value:fmt(expenses,S.displayCurrency)},
    {label:'Avg Daily Spend', value:fmt(expenses/Math.max(days,1),S.displayCurrency)},
    {label:'Avg Weekly Spend', value:fmt(expenses/Math.max(days/7,1),S.displayCurrency)},
  ].map(s=>`<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div></div>`).join('');
}

function renderTrendsChart(year) {
  destroyChart('trends');
  const months = Array.from({length:12},(_,i)=>(`${year}-${String(i+1).padStart(2,'0')}`));
  const incomes  = months.map(m=>S.transactions.filter(t=>t.type==='income'&&t.date?.startsWith(m)).reduce((s,t)=>s+convert(t.amount,t.currency,S.displayCurrency),0));
  const expenses = months.map(m=>S.transactions.filter(t=>t.type==='expense'&&t.date?.startsWith(m)).reduce((s,t)=>s+convert(t.amount,t.currency,S.displayCurrency),0));
  charts.trends = new Chart(document.getElementById('trendsChart').getContext('2d'), {
    type:'line',
    data:{ labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets:[
        {label:'Income', data:incomes, borderColor:'#3fb950', backgroundColor:'rgba(63,185,80,.1)', fill:true, tension:.3},
        {label:'Expenses', data:expenses, borderColor:'#f85149', backgroundColor:'rgba(248,81,73,.1)', fill:true, tension:.3},
      ]},
    options:{ ...chartDefaults(), scales:{ x:{ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}}, y:{ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}} } }
  });
}

function renderIncomeSourceChart(year) {
  destroyChart('incomeSource');
  const src={};
  S.transactions.filter(t=>t.type==='income'&&t.date?.startsWith(year)).forEach(t=>{ const v=convert(t.amount,t.currency,S.displayCurrency); src[t.category]=(src[t.category]||0)+v; });
  if (!Object.keys(src).length) return;
  charts.incomeSource = new Chart(document.getElementById('incomeSourceChart').getContext('2d'), {
    type:'pie',
    data:{ labels:Object.keys(src).map(id=>`${catById(id).icon} ${catById(id).name}`), datasets:[{data:Object.values(src), backgroundColor:CHART_PALETTE, borderWidth:2, borderColor:'rgba(0,0,0,0)'}] },
    options:{ ...chartDefaults() }
  });
}

function renderMoMChart(year) {
  destroyChart('mom');
  const months = Array.from({length:12},(_,i)=>(`${year}-${String(i+1).padStart(2,'0')}`));
  const cats = [...new Set(S.transactions.filter(t=>t.type==='expense').map(t=>t.category))].slice(0,5);
  charts.mom = new Chart(document.getElementById('momChart').getContext('2d'), {
    type:'bar',
    data:{ labels:['J','F','M','A','M','J','J','A','S','O','N','D'],
      datasets: cats.map((cat,i)=>({
        label:`${catById(cat).icon} ${catById(cat).name}`,
        data: months.map(m=>S.transactions.filter(t=>t.type==='expense'&&t.category===cat&&t.date?.startsWith(m)).reduce((s,t)=>s+convert(t.amount,t.currency,S.displayCurrency),0)),
        backgroundColor: CHART_PALETTE[i],
        borderRadius:3,
      }))
    },
    options:{ ...chartDefaults(), scales:{x:{stacked:true,ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}},y:{stacked:true,ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}}}}
  });
}

function renderDrillChart() {
  destroyChart('drill');
  const catId = document.getElementById('drillCategory')?.value;
  if (!catId) return;
  const txs = S.transactions.filter(t=>t.type==='expense'&&t.category===catId);
  const byMonth = {};
  txs.forEach(t=>{ const m=t.date?.slice(0,7); if(m) byMonth[m]=(byMonth[m]||0)+convert(t.amount,t.currency,S.displayCurrency); });
  const labels = Object.keys(byMonth).sort();
  charts.drill = new Chart(document.getElementById('drillChart').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[{label:`${catById(catId).name} spending`, data:labels.map(m=>byMonth[m]), backgroundColor:'rgba(88,166,255,.7)', borderRadius:4}] },
    options:{ ...chartDefaults(), scales:{x:{ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}},y:{ticks:{color:'#8b949e'},grid:{color:'rgba(48,54,61,.5)'}}} }
  });
}

// Year in Review
function showYearReview() {
  const year = parseInt(document.getElementById('analyticsYear').value||new Date().getFullYear());
  const txs  = S.transactions.filter(t=>t.date?.startsWith(year));
  let income=0, expenses=0;
  const byCat={};
  txs.forEach(t=>{
    const v=convert(t.amount,t.currency,S.displayCurrency);
    if(t.type==='income')income+=v; else { expenses+=v; byCat[t.category]=(byCat[t.category]||0)+v; }
  });
  const topCat = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('reviewContent').innerHTML = `
    <div class="summary-cards" style="margin-bottom:1rem">
      <div class="card green"><span class="card-label">Income ${year}</span><span class="card-value">${fmt(income,S.displayCurrency)}</span></div>
      <div class="card red"><span class="card-label">Expenses ${year}</span><span class="card-value">${fmt(expenses,S.displayCurrency)}</span></div>
      <div class="card blue"><span class="card-label">Net ${year}</span><span class="card-value">${fmt(income-expenses,S.displayCurrency)}</span></div>
    </div>
    <div class="chart-card"><p>📊 <strong>${txs.length}</strong> transactions · 
    💸 Top spending: <strong>${topCat?catById(topCat[0]).name:'—'}</strong> (${topCat?fmt(topCat[1],S.displayCurrency):'—'}) · 
    📅 Most active month: ${getMostActiveMonth(txs,year)}</p></div>`;
  modal('reviewModal',true);
}

function getMostActiveMonth(txs, year) {
  const counts={};
  txs.forEach(t=>{ const m=t.date?.slice(0,7); if(m) counts[m]=(counts[m]||0)+1; });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  if (!top) return '—';
  return new Date(top[0]+'-01').toLocaleString('default',{month:'long',year:'numeric'});
}

// ════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════
function renderSettings() {
  renderColorSwatches();
  renderCustomCategoriesList();
  renderProfileList();
}

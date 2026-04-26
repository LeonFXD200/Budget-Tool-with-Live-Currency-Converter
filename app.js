// ── State ──
let transactions = JSON.parse(localStorage.getItem('bf_transactions') || '[]');
let budgetLimits = JSON.parse(localStorage.getItem('bf_budgets') || '{}');
let rates = {};
let displayCurrency = localStorage.getItem('bf_currency') || 'GBP';
let donutChart, barChart;

const RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  setDefaultDate();
  await fetchRates();
  populateCurrencySelects();
  setupNav();
  setupForms();
  render();
});

// ── Fetch Live Rates ──
async function fetchRates() {
  const status = document.getElementById('rateStatus');
  try {
    const res = await fetch(RATE_API);
    const data = await res.json();
    rates = data.rates;
    const updated = new Date(data.date).toLocaleDateString();
    status.textContent = `Live rates as of ${updated}`;
    status.className = 'rate-status live';
  } catch {
    status.textContent = 'Could not load live rates — using cached fallback';
    status.className = 'rate-status error';
    rates = { USD:1, GBP:0.79, EUR:0.92, JPY:149.5, CAD:1.36, AUD:1.53, CHF:0.9, CNY:7.24, INR:83.1, MXN:17.2 };
  }
}

// ── Currency Conversion ──
function convert(amount, from, to) {
  if (!rates[from] || !rates[to]) return amount;
  return (amount / rates[from]) * rates[to];
}

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ── Populate Selects ──
function populateCurrencySelects() {
  const codes = Object.keys(rates).sort();
  const selects = ['displayCurrency', 'txCurrency', 'convFrom', 'convTo'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = codes.map(c => `<option value="${c}">${c}</option>`).join('');
  });
  document.getElementById('displayCurrency').value = displayCurrency;
  document.getElementById('txCurrency').value = displayCurrency;
  document.getElementById('convFrom').value = displayCurrency;
  document.getElementById('convTo').value = 'USD';
  document.getElementById('baseLabel').textContent = displayCurrency;
  renderRatesGrid();
  updateConverter();
}

// ── Navigation ──
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('displayCurrency').addEventListener('change', e => {
    displayCurrency = e.target.value;
    localStorage.setItem('bf_currency', displayCurrency);
    document.getElementById('baseLabel').textContent = displayCurrency;
    renderRatesGrid();
    render();
  });
}

// ── Forms ──
function setupForms() {
  document.getElementById('addTxBtn').addEventListener('click', addTransaction);
  document.getElementById('setBudgetBtn').addEventListener('click', setBudget);
  document.getElementById('swapBtn').addEventListener('click', swapCurrencies);
  document.getElementById('convAmount').addEventListener('input', updateConverter);
  document.getElementById('convFrom').addEventListener('change', updateConverter);
  document.getElementById('convTo').addEventListener('change', updateConverter);
  document.getElementById('searchTx').addEventListener('input', renderTransactionTable);
  document.getElementById('searchRate').addEventListener('input', renderRatesGrid);
}

function setDefaultDate() {
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
}

// ── Add Transaction ──
function addTransaction() {
  const type     = document.getElementById('txType').value;
  const desc     = document.getElementById('txDesc').value.trim();
  const category = document.getElementById('txCategory').value;
  const amount   = parseFloat(document.getElementById('txAmount').value);
  const currency = document.getElementById('txCurrency').value;
  const date     = document.getElementById('txDate').value;

  if (!desc) return alert('Please enter a description.');
  if (!amount || amount <= 0) return alert('Please enter a valid amount.');
  if (!date) return alert('Please select a date.');

  transactions.push({ id: Date.now(), type, desc, category, amount, currency, date });
  localStorage.setItem('bf_transactions', JSON.stringify(transactions));
  document.getElementById('txDesc').value = '';
  document.getElementById('txAmount').value = '';
  render();
}

// ── Delete Transaction ──
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  localStorage.setItem('bf_transactions', JSON.stringify(transactions));
  render();
}

// ── Set Budget Limit ──
function setBudget() {
  const cat   = document.getElementById('budgetCategory').value;
  const limit = parseFloat(document.getElementById('budgetLimit').value);
  if (!limit || limit <= 0) return alert('Enter a valid limit.');
  budgetLimits[cat] = limit;
  localStorage.setItem('bf_budgets', JSON.stringify(budgetLimits));
  document.getElementById('budgetLimit').value = '';
  render();
}

function deleteBudget(cat) {
  delete budgetLimits[cat];
  localStorage.setItem('bf_budgets', JSON.stringify(budgetLimits));
  render();
}

// ── Converter ──
function swapCurrencies() {
  const from = document.getElementById('convFrom');
  const to   = document.getElementById('convTo');
  [from.value, to.value] = [to.value, from.value];
  updateConverter();
}

function updateConverter() {
  const amount = parseFloat(document.getElementById('convAmount').value) || 0;
  const from   = document.getElementById('convFrom').value;
  const to     = document.getElementById('convTo').value;
  const result = convert(amount, from, to);
  const rate   = convert(1, from, to);
  document.getElementById('convResult').textContent = fmt(result, to);
  document.getElementById('convRate').textContent   = `1 ${from} = ${rate.toFixed(6)} ${to}`;
}

function renderRatesGrid() {
  const search = (document.getElementById('searchRate')?.value || '').toUpperCase();
  const grid   = document.getElementById('ratesGrid');
  const codes  = Object.keys(rates).sort().filter(c => !search || c.includes(search));
  grid.innerHTML = codes.map(c => {
    const val = convert(1, displayCurrency, c);
    return `<div class="rate-item"><span class="rate-code">${c}</span><span class="rate-val">${val.toFixed(4)}</span></div>`;
  }).join('');
}

// ── Main Render ──
function render() {
  renderSummaryCards();
  renderCharts();
  renderBudgetProgress();
  renderTransactionTable();
  renderBudgetLimitsList();
}

// ── Summary Cards ──
function renderSummaryCards() {
  let income = 0, expenses = 0;
  transactions.forEach(t => {
    const inDisplay = convert(t.amount, t.currency, displayCurrency);
    if (t.type === 'income') income += inDisplay;
    else expenses += inDisplay;
  });
  const net = income - expenses;
  document.getElementById('totalIncome').textContent   = fmt(income, displayCurrency);
  document.getElementById('totalExpenses').textContent = fmt(expenses, displayCurrency);
  document.getElementById('netBalance').textContent    = fmt(net, displayCurrency);
  const card = document.getElementById('balanceCard');
  card.className = `card blue ${net >= 0 ? 'surplus' : 'deficit'}`;
}

// ── Charts ──
function renderCharts() {
  // Donut – spending by category
  const expenseByCategory = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const v = convert(t.amount, t.currency, displayCurrency);
    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + v;
  });

  const catLabels = Object.keys(expenseByCategory);
  const catValues = Object.values(expenseByCategory);
  const palette = ['#58a6ff','#3fb950','#f85149','#d29922','#bc8cff','#ff7b72','#79c0ff','#56d364','#ffa657','#ff9bce'];

  if (donutChart) donutChart.destroy();
  const dCtx = document.getElementById('donutChart').getContext('2d');
  if (catLabels.length === 0) {
    dCtx.clearRect(0, 0, 400, 400);
  } else {
    donutChart = new Chart(dCtx, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{ data: catValues, backgroundColor: palette, borderWidth: 2, borderColor: '#161b22' }]
      },
      options: {
        plugins: { legend: { labels: { color: '#8b949e', font: { size: 11 } } } },
        cutout: '65%'
      }
    });
  }

  // Bar – income vs expenses
  const months = {};
  transactions.forEach(t => {
    const m = t.date.slice(0, 7);
    if (!months[m]) months[m] = { income: 0, expense: 0 };
    const v = convert(t.amount, t.currency, displayCurrency);
    months[m][t.type] += v;
  });
  const mLabels = Object.keys(months).sort().slice(-6);
  const mIncome   = mLabels.map(m => months[m].income);
  const mExpenses = mLabels.map(m => months[m].expense);

  if (barChart) barChart.destroy();
  const bCtx = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(bCtx, {
    type: 'bar',
    data: {
      labels: mLabels,
      datasets: [
        { label: 'Income',   data: mIncome,   backgroundColor: 'rgba(63,185,80,0.7)',  borderRadius: 4 },
        { label: 'Expenses', data: mExpenses, backgroundColor: 'rgba(248,81,73,0.7)',  borderRadius: 4 }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }
      }
    }
  });
}

// ── Budget Progress ──
function renderBudgetProgress() {
  const el = document.getElementById('budgetProgress');
  const cats = Object.keys(budgetLimits);
  if (cats.length === 0) {
    el.innerHTML = '<p class="no-limits">No budget limits set. Add some in the Budget Limits tab.</p>';
    return;
  }
  const actual = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const v = convert(t.amount, t.currency, displayCurrency);
    actual[t.category] = (actual[t.category] || 0) + v;
  });
  el.innerHTML = cats.map(cat => {
    const limit  = budgetLimits[cat];
    const spent  = actual[cat] || 0;
    const pct    = Math.min((spent / limit) * 100, 100);
    const cls    = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span>${cat}</span>
          <span>${fmt(spent, displayCurrency)} / ${fmt(limit, displayCurrency)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${cls}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ── Transaction Table ──
function renderTransactionTable() {
  const query = (document.getElementById('searchTx')?.value || '').toLowerCase();
  const body  = document.getElementById('txBody');
  const filtered = transactions
    .filter(t => !query || t.desc.toLowerCase().includes(query) || t.category.toLowerCase().includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">No transactions yet. Add one above!</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(t => {
    const inDisplay = convert(t.amount, t.currency, displayCurrency);
    return `
      <tr>
        <td>${t.date}</td>
        <td>${t.desc}</td>
        <td>${t.category}</td>
        <td><span class="badge ${t.type}">${t.type}</span></td>
        <td>${fmt(t.amount, t.currency)}</td>
        <td>${fmt(inDisplay, displayCurrency)}</td>
        <td><button class="delete-btn" onclick="deleteTransaction(${t.id})">🗑</button></td>
      </tr>`;
  }).join('');
}

// ── Budget Limits List ──
function renderBudgetLimitsList() {
  const el   = document.getElementById('budgetLimitsList');
  const cats = Object.keys(budgetLimits);
  if (cats.length === 0) {
    el.innerHTML = '<p class="no-limits">No limits set yet.</p>';
    return;
  }
  el.innerHTML = cats.map(cat => `
    <div class="budget-limit-item">
      <span>${cat}</span>
      <span>${fmt(budgetLimits[cat], displayCurrency)}</span>
      <button class="delete-btn" onclick="deleteBudget('${cat}')">🗑</button>
    </div>`).join('');
}

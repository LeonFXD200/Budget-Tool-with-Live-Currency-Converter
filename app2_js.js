// ════════════════════════════════════════════
// app2.js — Completes app.js
// ════════════════════════════════════════════

// ── Custom Categories ──
function renderCustomCategoriesList() {
  const el = document.getElementById('customCategoriesList');
  if (!el) return;
  if (!S.customCategories.length) { el.innerHTML = '<p class="no-data">No custom categories yet.</p>'; return; }
  el.innerHTML = S.customCategories.map(c => `
    <div class="category-item">
      <div class="cat-dot" style="background:${c.color}"></div>
      <span>${c.icon} ${c.name}</span>
      <span style="color:var(--text-muted);margin-left:auto;font-size:.75rem">${c.type}</span>
      <button class="delete-btn" onclick="deleteCustomCat('${c.id}')">🗑</button>
    </div>`).join('');
}

function deleteCustomCat(id) {
  S.customCategories = S.customCategories.filter(c => c.id !== id);
  saveState(); renderCustomCategoriesList(); populateCategorySelects();
  toast('Category deleted', 'info');
}

function saveCustomCategory() {
  const name  = document.getElementById('catName').value.trim();
  const icon  = document.getElementById('catIcon').value || '📦';
  const color = document.getElementById('catColor').value;
  const type  = document.getElementById('catType').value;
  if (!name) { toast('Enter a category name', 'error'); return; }
  const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
  S.customCategories.push({ id, name, icon, color, type });
  saveState(); populateCategorySelects(); renderCustomCategoriesList();
  modal('categoryModal', false);
  document.getElementById('catName').value = '';
  toast('Category saved', 'success');
}

// ── Profiles ──
function renderProfileList() {
  const el = document.getElementById('profileList');
  if (!el) return;
  el.innerHTML = S.profiles.map(p => `
    <div class="profile-item">
      <span>${p === S.profile ? '✓ ' : ''}${p}</span>
      ${S.profiles.length > 1 && p !== S.profile
        ? `<button class="delete-btn" onclick="deleteProfile('${p}')">🗑</button>`
        : ''}
    </div>`).join('');
}

function addProfile() {
  const name = document.getElementById('newProfileName').value.trim();
  if (!name) { toast('Enter a profile name', 'error'); return; }
  if (S.profiles.includes(name)) { toast('Profile already exists', 'error'); return; }
  S.profiles.push(name);
  saveState(); populateProfileSelects();
  document.getElementById('newProfileName').value = '';
  toast(`Profile "${name}" created`, 'success');
}

function deleteProfile(name) {
  if (!confirm(`Delete profile "${name}"? All its data will be removed.`)) return;
  S.profiles = S.profiles.filter(p => p !== name);
  PROFILE_KEYS.forEach(k => localStorage.removeItem(`bf_${name}_${k}`));
  saveState(); populateProfileSelects();
  toast(`Profile "${name}" deleted`, 'info');
}

// ── Budget Limits (injected into Settings) ──
function initBudgetLimitsUI() {
  if (document.getElementById('budgetLimitsCard')) { renderBudgetLimitsList(); populateBudgetLimitSelect(); return; }
  const grid = document.querySelector('.settings-grid');
  if (!grid) return;
  const card = document.createElement('div');
  card.className = 'form-card';
  card.id = 'budgetLimitsCard';
  card.innerHTML = `
    <h3>📊 Budget Limits</h3>
    <div class="form-stack">
      <div class="form-group">
        <label>Category</label>
        <select id="blCategory"></select>
      </div>
      <div class="form-group">
        <label>Monthly Limit (display currency)</label>
        <input type="number" id="blAmount" placeholder="0.00" min="0" step="0.01"/>
      </div>
      <button class="btn-primary" id="blSaveBtn">Set Limit</button>
      <div id="blList"></div>
    </div>`;
  // Insert before the last card (PWA install)
  const cards = grid.querySelectorAll('.form-card');
  grid.insertBefore(card, cards[cards.length - 1]);
  document.getElementById('blSaveBtn').addEventListener('click', setBudgetLimit);
  populateBudgetLimitSelect();
  renderBudgetLimitsList();
}

function populateBudgetLimitSelect() {
  const el = document.getElementById('blCategory');
  if (!el) return;
  el.innerHTML = allCats().filter(c => c.type !== 'income')
    .map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

function setBudgetLimit() {
  const cat = document.getElementById('blCategory').value;
  const amt = parseFloat(document.getElementById('blAmount').value);
  if (!amt || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
  S.budgetLimits[cat] = amt;
  saveState(); renderBudgetLimitsList(); renderBudgetProgress();
  document.getElementById('blAmount').value = '';
  toast('Budget limit saved', 'success');
}

function renderBudgetLimitsList() {
  const el = document.getElementById('blList');
  if (!el) return;
  const cats = Object.keys(S.budgetLimits);
  if (!cats.length) { el.innerHTML = '<p class="no-data" style="margin-top:.5rem">No limits set.</p>'; return; }
  el.innerHTML = '<div style="margin-top:.75rem">' + cats.map(cat => `
    <div class="profile-item">
      <span>${catById(cat).icon} ${catById(cat).name}</span>
      <span>${fmt(S.budgetLimits[cat], S.displayCurrency)}</span>
      <button class="delete-btn" onclick="deleteBudgetLimit('${cat}')">🗑</button>
    </div>`).join('') + '</div>';
}

function deleteBudgetLimit(cat) {
  delete S.budgetLimits[cat];
  saveState(); renderBudgetLimitsList(); renderBudgetProgress();
  toast('Limit removed', 'info');
}

// ── Override renderSettings to include budget limits ──
function renderSettings() {
  renderColorSwatches();
  renderCustomCategoriesList();
  renderProfileList();
  initBudgetLimitsUI();
}

// ── PIN / Security ──
let pinEntry = '';

function showPIN() {
  document.getElementById('pinOverlay').classList.remove('hidden');
}

function hidePIN() {
  document.getElementById('pinOverlay').classList.add('hidden');
}

function handlePIN(k) {
  if (k === 'clear') { pinEntry = pinEntry.slice(0, -1); }
  else if (k === 'submit') { verifyPIN(); return; }
  else if (pinEntry.length < 4) { pinEntry += k; }
  updatePINDots();
  if (pinEntry.length === 4) setTimeout(verifyPIN, 150);
}

function updatePINDots() {
  document.querySelectorAll('.pin-dots span').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinEntry.length);
  });
}

function verifyPIN() {
  if (pinEntry === S.pin) {
    hidePIN(); pinEntry = ''; updatePINDots();
    document.getElementById('pinError').classList.add('hidden');
    resetSessionTimer();
  } else {
    document.getElementById('pinError').classList.remove('hidden');
    pinEntry = ''; updatePINDots();
  }
}

function savePIN() {
  const a = document.getElementById('pinInputA').value;
  const b = document.getElementById('pinInputB').value;
  if (!/^\d{4}$/.test(a)) { toast('PIN must be exactly 4 digits', 'error'); return; }
  if (a !== b) { toast('PINs do not match', 'error'); return; }
  S.pin = a; saveState();
  document.getElementById('pinInputA').value = '';
  document.getElementById('pinInputB').value = '';
  toast('PIN saved ✓', 'success');
}

function saveSecuritySettings() {
  S.sessionTimeout  = parseInt(document.getElementById('sessionTimeoutInput').value) || 0;
  S.lowBalThreshold = parseFloat(document.getElementById('lowBalThreshold').value) || 0;
  saveState(); resetSessionTimer();
  toast('Security settings saved', 'success');
}

function resetSessionTimer() {
  clearTimeout(sessionTimer);
  if (S.pin && S.sessionTimeout > 0) {
    sessionTimer = setTimeout(showPIN, S.sessionTimeout * 60000);
  }
}

// ── Notifications ──
function scheduleNotificationCheck() {
  checkBillNotifications();
  setInterval(checkBillNotifications, 3600000);
}

function checkBillNotifications() {
  if (!S.notifBills) return;
  const now = new Date();
  S.bills.forEach(b => {
    let next = new Date(now.getFullYear(), now.getMonth(), b.day);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    const days = Math.ceil((next - now) / 86400000);
    if (days <= 3) {
      sendNotification('Bill Due Soon', `${b.name} due in ${days} day(s) — ${fmt(b.amount, b.currency)}`);
    }
  });
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f4b0.png'
    });
  } else {
    toast(`🔔 ${title}: ${body}`, 'info', 5000);
  }
}

function requestNotifPermission() {
  if (!('Notification' in window)) { toast('Notifications not supported', 'error'); return; }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? '🔔 Notifications enabled!' : 'Notifications denied', p === 'granted' ? 'success' : 'error');
  });
}

// ── AI ──
async function sendAI(promptOverride) {
  const input  = document.getElementById('aiInput');
  const prompt = promptOverride || input.value.trim();
  if (!prompt) return;
  input.value = '';

  appendAIMessage('user', prompt);
  const loadingEl = appendAIMessage('assistant', '...', true);

  const context = buildFinancialContext();

  try {
    const headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };
    if (S.aiApiKey) headers['x-api-key'] = S.aiApiKey;

    const res = await fetch(AI_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1000,
        system: `You are a helpful personal finance assistant. User's financial summary:\n${context}\nDisplay currency: ${S.displayCurrency}. Be concise and actionable.`,
        messages: [...aiHistory, { role: 'user', content: prompt }]
      })
    });

    const data  = await res.json();
    const reply = data.content?.[0]?.text || 'No response received.';
    aiHistory.push({ role:'user', content:prompt }, { role:'assistant', content:reply });
    if (aiHistory.length > 20) aiHistory = aiHistory.slice(-20);
    loadingEl.remove();
    appendAIMessage('assistant', reply);
  } catch (err) {
    loadingEl.remove();
    appendAIMessage('assistant', `⚠️ ${err.message}. Add your API key in Settings → AI Settings.`);
  }
}

function appendAIMessage(role, text, isLoading = false) {
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  el.innerHTML = `<div class="ai-bubble${isLoading ? ' loading' : ''}">${text.replace(/\n/g, '<br>')}</div>`;
  const msgs = document.getElementById('aiMessages');
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

function buildFinancialContext() {
  let income = 0, expenses = 0;
  const byCat = {};
  S.transactions.forEach(t => {
    const v = convert(t.amount, t.currency, S.displayCurrency);
    if (t.type === 'income') income += v;
    else { expenses += v; byCat[t.category] = (byCat[t.category] || 0) + v; }
  });
  const top = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([k,v]) => `${catById(k).name}: ${fmt(v, S.displayCurrency)}`).join(', ');
  return `${S.transactions.length} transactions. Income: ${fmt(income, S.displayCurrency)}. Expenses: ${fmt(expenses, S.displayCurrency)}. Net: ${fmt(income-expenses, S.displayCurrency)}. Top categories: ${top}. Goals: ${S.savingsGoals.length}. Debts: ${S.debts.length}. Bills: ${S.bills.length}.`;
}

async function aiCategorise() {
  const desc = document.getElementById('txDesc').value.trim();
  if (!desc) { toast('Enter a description first', 'error'); return; }
  toast('Auto-categorising...', 'info', 2000);
  try {
    const headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };
    if (S.aiApiKey) headers['x-api-key'] = S.aiApiKey;
    const res = await fetch(AI_API, {
      method: 'POST', headers,
      body: JSON.stringify({
        model: AI_MODEL, max_tokens: 50,
        messages: [{ role: 'user', content: `Categorise this transaction: "${desc}". Categories: ${allCats().map(c=>c.name).join(', ')}. Reply with ONLY the exact category name.` }]
      })
    });
    const data = await res.json();
    const suggested = data.content?.[0]?.text?.trim();
    const match = allCats().find(c => c.name.toLowerCase() === suggested?.toLowerCase());
    if (match) { document.getElementById('txCategory').value = match.id; toast(`Set to: ${match.icon} ${match.name}`, 'success'); }
    else toast('Could not determine category', 'info');
  } catch { toast('AI unavailable — add API key in Settings', 'error'); }
}

async function scanReceipt(file) {
  toast('Scanning receipt...', 'info', 3000);
  const reader = new FileReader();
  reader.onload = async e => {
    const b64 = e.target.result.split(',')[1];
    try {
      const headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };
      if (S.aiApiKey) headers['x-api-key'] = S.aiApiKey;
      const res = await fetch(AI_API, {
        method: 'POST', headers,
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: 200,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: file.type, data: b64 } },
            { type: 'text', text: 'Extract from this receipt: total amount, merchant/store name, and date. Respond ONLY as JSON: {"amount": number, "description": "string", "date": "YYYY-MM-DD"}' }
          ]}]
        })
      });
      const data = await res.json();
      const json = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g,'').trim() || '{}');
      if (json.amount) document.getElementById('txAmount').value = json.amount;
      if (json.description) document.getElementById('txDesc').value = json.description;
      if (json.date) document.getElementById('txDate').value = json.date;
      document.getElementById('txType').value = 'expense';
      switchTab('transactions');
      toast('Receipt scanned! Review and add.', 'success');
    } catch { toast('Could not scan receipt — check API key', 'error'); }
  };
  reader.readAsDataURL(file);
}

// ── Data Management ──
function backupData() {
  const backup = {};
  Object.keys(localStorage).filter(k => k.startsWith('bf_')).forEach(k => backup[k] = localStorage.getItem(k));
  download(`budgetflow_backup_${today()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  toast('Backup downloaded', 'success');
}

function restoreData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('This will replace all current data. Continue?')) return;
      Object.entries(data).forEach(([k,v]) => localStorage.setItem(k, v));
      loadState(); applySettings(); populateAllSelects(); render();
      toast('Data restored successfully', 'success');
    } catch { toast('Invalid backup file', 'error'); }
  };
  reader.readAsText(file);
}

function clearData() {
  if (!confirm('Delete ALL data for ALL profiles? This cannot be undone.')) return;
  Object.keys(localStorage).filter(k => k.startsWith('bf_')).forEach(k => localStorage.removeItem(k));
  location.reload();
}

function printReport() {
  window.print();
}

function showActivityLog() {
  const el = document.getElementById('logContent');
  el.innerHTML = S.activityLog?.length
    ? S.activityLog.map(l => `<div class="log-item"><span class="log-time">${new Date(l.time).toLocaleString()}</span><span>${l.msg}</span></div>`).join('')
    : '<p class="no-data">No activity logged yet.</p>';
  modal('logModal', true);
}

// ── PWA ──
function setupPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    pwaInstallPrompt = e;
    const btn    = document.getElementById('installPwaBtn');
    const status = document.getElementById('pwaStatus');
    if (btn)    btn.style.display = 'block';
    if (status) status.textContent = '✓ App is ready to install!';
    btn?.addEventListener('click', () => {
      pwaInstallPrompt.prompt();
      pwaInstallPrompt.userChoice.then(r => {
        if (r.outcome === 'accepted') toast('App installed!', 'success');
        pwaInstallPrompt = null;
        if (btn) btn.style.display = 'none';
      });
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('SW registered ✓'))
      .catch(err => console.warn('SW registration failed:', err));
  }
}

// ── Keyboard Shortcuts ──
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'n') { e.preventDefault(); switchTab('transactions'); setTimeout(() => document.getElementById('txDesc')?.focus(), 50); return; }
      if (e.key === '1') { e.preventDefault(); switchTab('dashboard'); return; }
      if (e.key === '2') { e.preventDefault(); switchTab('transactions'); return; }
      if (e.key === '3') { e.preventDefault(); switchTab('analytics'); return; }
      if (e.key === '4') { e.preventDefault(); switchTab('currency'); return; }
      if (e.key === 'l') { e.preventDefault(); if (S.pin) showPIN(); return; }
    }

    if (!typing && e.key === '/') {
      e.preventDefault();
      switchTab('transactions');
      setTimeout(() => document.getElementById('searchTx')?.focus(), 50);
    }
  });
}

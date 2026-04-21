let sites = [];
let usage = {};
let addFormOpen = false;
let addStyle = 'hard';
let editStyle = 'hard';

// ── Helpers ──────────────────────────────────────────────

function parseDomain(raw) {
  raw = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return raw;
}

function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function getUsedMs(domain) { return usage[domain] || 0; }
function getBudgetMs(site) { return site.budget * 60000; }

function getPct(site) {
  return Math.min(100, Math.round((getUsedMs(site.domain) / getBudgetMs(site)) * 100));
}

// ── Render ───────────────────────────────────────────────

function render() {
  const list = document.getElementById('site-list');
  const meta = document.getElementById('header-meta');

  if (!sites.length) {
    list.innerHTML = '<div class="empty">No sites added yet.<br>Hit the button below to get started.</div>';
    meta.innerHTML = '0 sites';
    return;
  }

  const blockedCount = sites.filter(s => s.enabled && getPct(s) >= 100).length;
  if (blockedCount > 0) {
    meta.innerHTML = `<span class="active">${blockedCount} blocked today</span>`;
  } else {
    meta.innerHTML = `${sites.length} site${sites.length > 1 ? 's' : ''}`;
  }

  list.innerHTML = sites.map((site, i) => {
    const usedMs  = getUsedMs(site.domain);
    const budMs   = getBudgetMs(site);
    const pct     = Math.min(100, Math.round((usedMs / budMs) * 100));
    const remMs   = Math.max(0, budMs - usedMs);
    const remMins = Math.ceil(remMs / 60000);

    const fillCls  = pct >= 100 ? 'full' : pct >= 75 ? 'warn' : 'ok';
    const timeCls  = pct >= 100 ? 'full' : pct >= 75 ? 'warn' : '';
    const timeText = pct >= 100 ? 'Blocked' : `${fmtTime(remMs)} left`;

    return `
      <div class="site-row${!site.enabled ? ' disabled' : ''}">
        <button class="toggle${site.enabled ? ' on' : ''}" data-a="toggle" data-i="${i}"></button>
        <div class="site-info">
          <div class="site-name">${site.domain}</div>
          <div class="site-stats">
            <div class="bar-track">
              <div class="bar-fill ${fillCls}" style="width:${pct}%"></div>
            </div>
            <span class="time-label ${timeCls}">${timeText}</span>
            <span class="badge ${site.blockStyle}">${site.blockStyle === 'hard' ? 'HARD' : 'SOFT'}</span>
          </div>
        </div>
        <div class="actions">
          <button class="icon-btn" data-a="edit" data-i="${i}" title="Edit">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M10 2l2 2-8 8H2v-2L10 2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="icon-btn del" data-a="del" data-i="${i}" title="Remove">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M5 4V3h4v1M5.5 6.5v4M8.5 6.5v4M3 4l.8 7.5h6.4L11 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-a]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const i = parseInt(el.dataset.i);
      if (el.dataset.a === 'toggle') toggleSite(i);
      if (el.dataset.a === 'edit')   openEdit(i);
      if (el.dataset.a === 'del')    deleteSite(i);
    });
  });
}

// ── Data ─────────────────────────────────────────────────

async function load() {
  const s = await chrome.storage.sync.get('sites');
  sites = s.sites || [];
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_USAGE' });
    usage = res?.usage || {};
  } catch { usage = {}; }
  render();
}

async function save() {
  await chrome.storage.sync.set({ sites });
  render();
}

// ── Actions ───────────────────────────────────────────────

function toggleSite(i) { sites[i].enabled = !sites[i].enabled; save(); }
function deleteSite(i) { sites.splice(i, 1); save(); }

// ── Add form ──────────────────────────────────────────────

document.getElementById('add-toggle').addEventListener('click', () => {
  addFormOpen = !addFormOpen;
  document.getElementById('add-form').classList.toggle('visible', addFormOpen);
  document.getElementById('add-toggle').classList.toggle('open', addFormOpen);
});

// Quick picks (add)
document.getElementById('add-picks').addEventListener('click', e => {
  const p = e.target.closest('.pick'); if (!p) return;
  document.querySelectorAll('#add-picks .pick').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  document.getElementById('new-budget').value = p.dataset.v;
});

document.getElementById('new-budget').addEventListener('input', () => {
  document.querySelectorAll('#add-picks .pick').forEach(x => x.classList.remove('active'));
});

// Style selector (add)
document.getElementById('add-style-sel').addEventListener('click', e => {
  const o = e.target.closest('.style-opt'); if (!o) return;
  document.querySelectorAll('#add-style-sel .style-opt').forEach(x => x.classList.remove('active'));
  o.classList.add('active');
  addStyle = o.dataset.s;
});

// Add button
document.getElementById('add-btn').addEventListener('click', async () => {
  const raw    = document.getElementById('new-domain').value;
  const budget = parseInt(document.getElementById('new-budget').value);
  const domEl  = document.getElementById('new-domain');

  if (!raw.trim() || !budget || budget < 1) {
    domEl.classList.add('error');
    setTimeout(() => domEl.classList.remove('error'), 1200);
    return;
  }

  const domain = parseDomain(raw);
  if (!domain) { domEl.classList.add('error'); return; }

  if (sites.find(s => s.domain === domain)) {
    domEl.classList.add('error');
    domEl.value = '';
    domEl.placeholder = 'Already added!';
    setTimeout(() => { domEl.classList.remove('error'); domEl.placeholder = 'e.g. reddit.com'; }, 1500);
    return;
  }

  sites.push({ domain, budget, blockStyle: addStyle, enabled: true });
  await save();

  // Reset form
  domEl.value = '';
  document.getElementById('new-budget').value = '15';
  document.querySelectorAll('#add-picks .pick').forEach(x =>
    x.classList.toggle('active', x.dataset.v === '15')
  );
  document.querySelectorAll('#add-style-sel .style-opt').forEach(x =>
    x.classList.toggle('active', x.dataset.s === 'hard')
  );
  addStyle = 'hard';
  addFormOpen = false;
  document.getElementById('add-form').classList.remove('visible');
  document.getElementById('add-toggle').classList.remove('open');
});

// ── Edit modal ────────────────────────────────────────────

function openEdit(i) {
  const site = sites[i];
  document.getElementById('edit-idx').value = i;
  document.getElementById('edit-domain-label').textContent = site.domain;
  document.getElementById('edit-budget').value = site.budget;

  document.querySelectorAll('#edit-picks .pick').forEach(p =>
    p.classList.toggle('active', parseInt(p.dataset.v) === site.budget)
  );

  editStyle = site.blockStyle;
  document.querySelectorAll('#edit-style-sel .style-opt').forEach(o =>
    o.classList.toggle('active', o.dataset.s === site.blockStyle)
  );

  document.getElementById('modal-wrap').classList.add('open');
  document.body.classList.add('modal-open');
}

function closeModal() {
  document.getElementById('modal-wrap').classList.remove('open');
  document.body.classList.remove('modal-open');
}

document.getElementById('edit-picks').addEventListener('click', e => {
  const p = e.target.closest('.pick'); if (!p) return;
  document.querySelectorAll('#edit-picks .pick').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  document.getElementById('edit-budget').value = p.dataset.v;
});

document.getElementById('edit-budget').addEventListener('input', () => {
  document.querySelectorAll('#edit-picks .pick').forEach(x => x.classList.remove('active'));
});

document.getElementById('edit-style-sel').addEventListener('click', e => {
  const o = e.target.closest('.style-opt'); if (!o) return;
  document.querySelectorAll('#edit-style-sel .style-opt').forEach(x => x.classList.remove('active'));
  o.classList.add('active');
  editStyle = o.dataset.s;
});

document.getElementById('modal-cancel').addEventListener('click', closeModal);

document.getElementById('modal-save').addEventListener('click', async () => {
  const i      = parseInt(document.getElementById('edit-idx').value);
  const budget = parseInt(document.getElementById('edit-budget').value);
  if (!budget || budget < 1) return;

  sites[i].budget     = budget;
  sites[i].blockStyle = editStyle;
  await save();
  closeModal();
});

document.getElementById('reset-usage').addEventListener('click', async () => {
  const i = parseInt(document.getElementById('edit-idx').value);
  const domain = sites[i].domain;
  await chrome.runtime.sendMessage({ type: 'RESET_SITE_USAGE', domain });
  usage[domain] = 0;
  render();
  closeModal();
});

// Close modal on bg click
document.getElementById('modal-wrap').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-wrap')) closeModal();
});

load();

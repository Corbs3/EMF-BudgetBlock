// Active tracking session
let activeSession = null; // { tabId, domain, startTime }

// --- Helpers ---

function getDomain(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function getNextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// --- Storage ---

async function getSites() {
  const data = await chrome.storage.sync.get('sites');
  return data.sites || [];
}

async function getUsage() {
  const data = await chrome.storage.local.get('usage');
  const all = data.usage || {};
  return all[todayKey()] || {};
}

async function addUsage(domain, ms) {
  const data = await chrome.storage.local.get('usage');
  const all = data.usage || {};
  const today = todayKey();
  if (!all[today]) all[today] = {};
  all[today][domain] = (all[today][domain] || 0) + ms;

  // Keep only last 7 days
  const keys = Object.keys(all).sort();
  while (keys.length > 7) delete all[keys.shift()];

  await chrome.storage.local.set({ usage: all });
  return all[today][domain];
}

// --- Site matching ---

async function findSite(domain) {
  if (!domain) return null;
  const sites = await getSites();
  return sites.find(s =>
    s.enabled && (domain === s.domain || domain.endsWith('.' + s.domain))
  ) || null;
}

// --- Badge ---

async function updateBadge() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { clearBadge(); return; }

  const domain = getDomain(tab.url);
  const site = await findSite(domain);
  if (!site) { clearBadge(); return; }

  const usage = await getUsage();
  let usedMs = usage[site.domain] || 0;

  // Include current unsaved session time
  if (activeSession && activeSession.domain === site.domain) {
    usedMs += Date.now() - activeSession.startTime;
  }

  const budgetMs = site.budget * 60000;
  const remainingMs = Math.max(0, budgetMs - usedMs);
  const remainingMins = Math.ceil(remainingMs / 60000);
  const pct = usedMs / budgetMs;

  chrome.action.setBadgeTextColor({ color: '#FFFFFF' });

  if (remainingMs <= 0) {
    chrome.action.setBadgeText({ text: '✕' });
    chrome.action.setBadgeBackgroundColor({ color: '#CC1111' });
  } else {
    const text = remainingMins >= 60 ? `${Math.floor(remainingMins / 60)}h` : `${remainingMins}m`;
    chrome.action.setBadgeText({ text });
    if (pct >= 0.75)      chrome.action.setBadgeBackgroundColor({ color: '#CC1111' });
    else if (pct >= 0.5)  chrome.action.setBadgeBackgroundColor({ color: '#FF8C00' });
    else                  chrome.action.setBadgeBackgroundColor({ color: '#CC9200' });
  }
}

function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
}

// --- Enforcement ---

async function checkAndEnforce(tabId, url) {
  const domain = getDomain(url);
  if (!domain) return;

  const site = await findSite(domain);
  if (!site) return;

  const usage = await getUsage();
  const usedMs = usage[site.domain] || 0;
  const budgetMs = site.budget * 60 * 1000;

  if (usedMs >= budgetMs) {
    updateBadge();
    if (site.blockStyle === 'hard') {
      const blocked = chrome.runtime.getURL(
        `blocked.html?domain=${encodeURIComponent(site.domain)}&budget=${site.budget}`
      );
      chrome.tabs.update(tabId, { url: blocked }).catch(() => {});
    } else {
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_OVERLAY',
        domain: site.domain,
        budget: site.budget
      }).catch(() => {});
    }
  } else {
    updateBadge();
    const remainingMins = Math.ceil((budgetMs - usedMs) / 60000);
    chrome.tabs.sendMessage(tabId, {
      type: 'BUDGET_INFO',
      domain: site.domain,
      remainingMins,
      totalMins: site.budget
    }).catch(() => {});
  }
}

// --- Time tracking ---

async function startTracking(tabId, url) {
  const domain = getDomain(url);
  if (!domain) return;

  const site = await findSite(domain);
  if (!site) { clearBadge(); return; }

  activeSession = { tabId, domain: site.domain, startTime: Date.now() };
  updateBadge();
}

async function stopTracking() {
  if (!activeSession) return;
  const elapsed = Date.now() - activeSession.startTime;
  if (elapsed > 500) { // ignore < 0.5s blips
    await addUsage(activeSession.domain, elapsed);
  }
  activeSession = null;
}

// --- Tab event listeners ---

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await stopTracking();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) return;
  await startTracking(tabId, tab.url);
  await checkAndEnforce(tabId, tab.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !changeInfo.url) return;
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active || active.id !== tabId) return;

  await stopTracking();
  await startTracking(tabId, changeInfo.url);
  await checkAndEnforce(tabId, changeInfo.url);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await stopTracking();
  } else {
    const [active] = await chrome.tabs.query({ active: true, windowId });
    if (active?.url) {
      await startTracking(active.id, active.url);
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (activeSession?.tabId === tabId) await stopTracking();
});

// --- Alarms ---

// Tick every minute to keep badge current
chrome.alarms.create('badge-tick', { periodInMinutes: 1 });

chrome.alarms.create('midnight-reset', {
  when: getNextMidnight(),
  periodInMinutes: 24 * 60
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'badge-tick') {
    updateBadge();
  }
  if (alarm.name === 'midnight-reset') {
    clearBadge();
    chrome.alarms.create('midnight-reset', {
      when: getNextMidnight(),
      periodInMinutes: 24 * 60
    });
  }
});

// --- Message handler (from popup + content scripts) ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_USAGE') {
    getUsage().then(usage => sendResponse({ usage }));
    return true;
  }

  if (msg.type === 'RESET_SITE_USAGE') {
    (async () => {
      const data = await chrome.storage.local.get('usage');
      const all = data.usage || {};
      const today = todayKey();
      if (all[today]) delete all[today][msg.domain];
      await chrome.storage.local.set({ usage: all });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Content script calls this on every page load to check if it should be blocked
  if (msg.type === 'CHECK_SITE') {
    (async () => {
      const domain = getDomain(msg.url);
      const site = await findSite(domain);
      if (!site) { sendResponse({ action: 'none' }); return; }

      const usage = await getUsage();
      const usedMs = usage[site.domain] || 0;
      const budgetMs = site.budget * 60000;

      if (usedMs >= budgetMs) {
        sendResponse({ action: site.blockStyle, domain: site.domain, budget: site.budget });
      } else {
        const remainingMins = Math.ceil((budgetMs - usedMs) / 60000);
        const pct = usedMs / budgetMs;
        sendResponse({ action: 'allow', domain: site.domain, remainingMins, totalMins: site.budget, warn: pct >= 0.75 });
      }
    })();
    return true;
  }
});

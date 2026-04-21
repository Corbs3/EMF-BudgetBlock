// Don't run inside our own extension pages
if (location.protocol === 'chrome-extension:') throw new Error('skip');

let overlayShown = false;
let badgeEl = null;
let badgeStyleEl = null;

// ── Check on page load ────────────────────────────────────
// Primary enforcement path — runs on every page load so it doesn't
// depend on the service worker being awake for tab events.
(function checkOnLoad() {
  chrome.runtime.sendMessage(
    { type: 'CHECK_SITE', url: location.href },
    (res) => {
      if (chrome.runtime.lastError || !res) return;

      if (res.action === 'hard') {
        const url = chrome.runtime.getURL(
          `blocked.html?domain=${encodeURIComponent(res.domain)}&budget=${res.budget}`
        );
        window.location.replace(url);
      } else if (res.action === 'overlay') {
        showOverlay(res.domain, res.budget);
      } else if (res.action === 'allow' && res.warn) {
        updateBadge(res.remainingMins, res.totalMins);
      }
    }
  );
})();

// ── Listen for messages from background (tab focus events) ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_OVERLAY' && !overlayShown) {
    showOverlay(msg.domain, msg.budget);
  }
  if (msg.type === 'BUDGET_INFO') {
    updateBadge(msg.remainingMins, msg.totalMins);
  }
});

// ── Overlay ───────────────────────────────────────────────
function showOverlay(domain, budget) {
  overlayShown = true;
  if (badgeEl) { badgeEl.remove(); badgeEl = null; }
  if (badgeStyleEl) { badgeStyleEl.remove(); badgeStyleEl = null; }

  const style = document.createElement('style');
  style.textContent = `
    #__bb-overlay__ {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.92);
      z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      backdrop-filter: blur(6px);
    }
    #__bb-overlay__ .bb-amber-top {
      position: absolute; top: 0; left: 0; right: 0; height: 4px; background: #FFB800;
    }
    #__bb-overlay__ .bb-card {
      background: #111; border: 1px solid #2a2a2a;
      border-radius: 16px; padding: 44px 52px;
      max-width: 400px; text-align: center; position: relative;
    }
    #__bb-overlay__ .bb-sign {
      width: 64px; height: 64px;
      border: 6px solid #CC1111; border-radius: 50%;
      margin: 0 auto 20px; position: relative;
      display: flex; align-items: center; justify-content: center;
    }
    #__bb-overlay__ .bb-sign::after {
      content: ''; position: absolute;
      width: 58px; height: 6px;
      background: #CC1111; border-radius: 3px; transform: rotate(-45deg);
    }
    #__bb-overlay__ h2 {
      color: #fff; font-size: 21px; font-weight: 800;
      margin: 0 0 10px; letter-spacing: -0.3px;
    }
    #__bb-overlay__ p { color: #aaa; font-size: 14px; margin: 0 0 6px; line-height: 1.6; }
    #__bb-overlay__ .bb-domain { color: #FFB800; }
    #__bb-overlay__ .bb-bar {
      width: 100%; height: 3px; background: #1e1e1e;
      border-radius: 2px; margin: 20px 0 0; overflow: hidden;
    }
    #__bb-overlay__ .bb-fill { height: 100%; background: #CC1111; width: 100%; }
    #__bb-overlay__ .bb-reset { color: #555; font-size: 12px; margin-top: 14px; }
    #__bb-overlay__ .bb-dismiss {
      margin-top: 24px; padding: 9px 20px;
      background: transparent; border: 1px solid #2a2a2a;
      border-radius: 8px; color: #666; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    }
    #__bb-overlay__ .bb-dismiss:hover { border-color: #555; color: #aaa; }
  `;

  const overlay = document.createElement('div');
  overlay.id = '__bb-overlay__';
  overlay.innerHTML = `
    <div class="bb-amber-top"></div>
    <div class="bb-card">
      <div class="bb-sign"></div>
      <h2>Time's up on <span class="bb-domain">${domain}</span></h2>
      <p>You've used your full ${budget}-minute daily budget.</p>
      <div class="bb-bar"><div class="bb-fill"></div></div>
      <p class="bb-reset">Budget resets at midnight.</p>
      <button class="bb-dismiss">I know — let me through anyway</button>
    </div>
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  overlay.querySelector('.bb-dismiss').addEventListener('click', () => {
    overlay.remove(); style.remove();
  });
}

// ── Low budget badge ──────────────────────────────────────
function updateBadge(remainingMins, totalMins) {
  const pct = remainingMins / totalMins;
  if (pct > 0.25) {
    if (badgeEl) { badgeEl.remove(); badgeEl = null; }
    if (badgeStyleEl) { badgeStyleEl.remove(); badgeStyleEl = null; }
    return;
  }

  if (!badgeEl) {
    badgeStyleEl = document.createElement('style');
    badgeStyleEl.textContent = `
      #__bb-badge__ {
        position: fixed; bottom: 14px; right: 14px;
        background: #111; border: 1px solid #2a2a2a;
        border-radius: 8px; padding: 7px 11px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px; color: #888;
        z-index: 2147483646; pointer-events: none;
      }
      #__bb-badge__ .t { color: #FFB800; font-weight: 700; }
    `;
    badgeEl = document.createElement('div');
    badgeEl.id = '__bb-badge__';
    document.head.appendChild(badgeStyleEl);
    document.body.appendChild(badgeEl);
  }

  badgeEl.innerHTML = `⏱ <span class="t">${remainingMins}m</span> left today`;
}

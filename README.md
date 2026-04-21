# BudgetBlock

A Chrome extension that lets you set a daily time budget per website. When your time is up, the site gets blocked until midnight.

Built for people who want friction, not just a reminder.

## Features

- **Per-site time budgets** - set a daily limit (in minutes) for any domain
- **Two block modes:**
  - **Hard block** - redirects to a full block page when time runs out
  - **Shame overlay** - shows a dismissible overlay (you can still get through)
- **Live badge counter** - shows remaining time on the extension icon, colour-coded by urgency
- **Low budget warning** - an on-page badge appears when you're in the last 25% of your budget
- **Usage resets at midnight** - automatically, every day
- **Edit or disable sites** - without deleting them
- **7-day usage history** stored locally

## Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `budget-block` folder

## How It Works

BudgetBlock tracks active time on each configured domain:

1. When you open or switch to a tab, a timer starts
2. When you switch away, close the tab, or lose window focus, elapsed time is saved
3. On every page load, the content script checks whether you've hit your budget
4. If you have, it either redirects you to the block page (hard) or shows an overlay (soft)
5. The badge updates every minute via an alarm

Time data is stored locally. Site settings sync across your Chrome profile via `storage.sync`.

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Saves usage data locally and syncs site settings |
| `alarms` | Updates the badge every minute and triggers the midnight reset |
| `tabs` | Tracks which tab is active to start/stop the timer |
| `windows` | Detects when Chrome loses focus to pause tracking |
| `host_permissions: <all_urls>` | Required to run on every site you want to block |

No data is sent anywhere. Everything stays in your browser.

## File Structure

```
budget-block/
  manifest.json   Extension config and permissions
  background.js   Service worker - time tracking, enforcement, badge updates
  content.js      Runs on every page - triggers block or overlay if over budget
  popup.html      Extension popup UI
  popup.js        Popup logic - add/edit/remove sites, view usage
  blocked.html    Full-page hard block screen
  icons/          Extension icons (16px, 48px, 128px)
```

## Licence

MIT

# Trevor Debugging Notes

## Known issue: Playwright CDN blocked in container

### Symptom
Tests fail during setup with a DNS resolution error for `cdn.playwright.dev`. Chromium never installs, so no tests run.

### Root cause
The managed agent container has general internet access (ledgerlab.ai, mailinator.com, httpbin.org all reachable) but `cdn.playwright.dev` specifically is blocked. This prevents `npx playwright install chromium` from downloading the Chromium binary.

### Fix applied
Two changes were made:

**1. `managed-agent/run-session.js`** — setup command falls back to apt if the Playwright CDN fails:
```
npx playwright install chromium 2>/dev/null || apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium 2>/dev/null
```

**2. `scripts/launch-browser.js`** (new shared helper) — auto-detects the system Chromium path so scripts work whether Playwright's bundled Chromium or the system one was installed:
```javascript
const { launchBrowser } = require('./launch-browser');
const browser = await launchBrowser();
```
All 8 test scripts updated to use this instead of `chromium.launch(...)` directly.

### Verifying network access
If tests fail to reach external URLs, run this inside a session first:
```bash
curl -s https://httpbin.org/ip
curl -s -o /dev/null -w "%{http_code}" https://ledgerlab.ai
curl -s -o /dev/null -w "%{http_code}" https://www.mailinator.com
```

---

## Known issue: Mailinator inbox appears empty via Playwright

### Symptom
AUTH-01 and AUTH-04 time out waiting for an email row that never appears, even though the email is visible in a real browser.

### Root cause
Mailinator's inbox is JavaScript-rendered. Using `waitForLoadState('domcontentloaded')` returns before the JS app has fetched and populated the email list.

### Fix applied
Changed to `waitForLoadState('networkidle')` in auth-01 and auth-04 scripts so Playwright waits for the JS to finish loading emails before checking for rows.

### Status
Fix applied but not yet verified end-to-end with a live signup (blocked by the Playwright CDN issue above, which is now fixed). Run the full suite to confirm.

---

## Running a debug session

Always use the managed agent runner — never run scripts directly:
```bash
cd managed-agent && npm run run -- "your debug task here"
```

Example: check what Playwright actually sees on a page:
```
"Write and run a Playwright script that loads https://example.com, waits for networkidle, screenshots it, and dumps the page text to console"
```

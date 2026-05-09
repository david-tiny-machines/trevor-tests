# Trevor Debugging Notes

## Resolved: Playwright CDN blocked in container

### Symptom
Tests fail during setup with a DNS resolution error for `cdn.playwright.dev`.

### Root cause
`cdn.playwright.dev` is blocked in the managed agent container. `npx playwright install chromium` fails.

### Fix
`run-session.js` setup command falls back to apt:
```
npx playwright install chromium 2>/dev/null || apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium 2>/dev/null
```
`scripts/launch-browser.js` launches Playwright's bundled Chromium with no `executablePath` override.

---

## Resolved: Mailinator inbox always appears empty via Playwright

### Symptom
AUTH-01 and AUTH-04 time out waiting for a verification email that is clearly visible in a real browser.

### Root cause (final)
Mailinator delivers inbox data via WebSocket (`wss://www.mailinator.com/ws/fetchpub`). The managed agent container's `libcurl` does not support the `wss://` protocol — confirmed with:
```
curl -sv 'wss://www.mailinator.com/ws/fetchpub'
# → Protocol "wss" not supported or disabled in libcurl
```
Playwright's Chromium inherits this limitation. No amount of `waitForLoadState` tuning or timeout increases will work — the WebSocket never delivers data.

Earlier attempts that didn't work:
- `waitForLoadState('domcontentloaded')` — too early
- `waitForLoadState('networkidle')` — resolves before WebSocket frame arrives
- Retry loop with reloads — same problem on each attempt

### Fix
Replaced Mailinator UI navigation with **Guerrilla Mail REST API** in `scripts/mail-helper.js`. Pure HTTP polling — no WebSocket, no browser, no key required.

```javascript
const { createInbox, waitForCode } = require('./mail-helper');
const { email, sid_token } = await createInbox('ledgerlab-test-' + Date.now());
const code = await waitForCode(sid_token, 'Activate');
```

Email addresses take the form `{prefix}@guerrillamailblock.com`. LedgerLab delivers to this domain.

---

## Resolved: Cookie consent dialog blocking form submission

### Symptom
Signup form submission appeared to succeed (no JS error) but page stayed on `/signup` and no email arrived. The URL doesn't change on the verification step — this is expected — but in early runs the form wasn't submitting at all.

### Root cause
A cookie consent banner ("Accept all" / "Reject non-essential") loads on top of the page and intercepted clicks before the form could be interacted with.

### Fix
Both auth-01 and auth-04 now dismiss the banner before filling the form:
```javascript
const acceptBtn = page.locator('button:has-text("Accept all")');
if (await acceptBtn.isVisible().catch(() => false)) {
  await acceptBtn.click();
  await page.waitForTimeout(500);
}
```

---

## Verifying network access

If tests fail to reach external URLs, run this inside a session:
```bash
curl -s https://httpbin.org/ip
curl -s -o /dev/null -w "%{http_code}" https://ledgerlab.ai
curl -s -o /dev/null -w "%{http_code}" https://api.guerrillamail.com/ajax.php?f=get_email_address
```

---

## Resolved: AUTH-04 flakiness — wrong polling cursor

### Symptom
AUTH-04 sporadically reports "reset code not received" after the 4-minute polling window, even though the reset email arrives in the inbox.

### Root cause
`mail-helper.js` was advancing its polling cursor with `seq = data.count`. Guerrilla's `count` is the *total inbox size*, not the highest message id, so the cursor was effectively stuck — every poll re-scanned the entire inbox. That had two effects:
1. Wasted budget refetching old emails on every iteration.
2. The earlier `Activate` email from signup could match a later wait for any subject containing the same keyword, causing the reset poll to either pick the wrong email or stall.

### Fix applied
`waitForCode` now tracks the highest `mail_id` seen and uses it as the polling cursor. At entry it baselines the inbox so anything already present is ignored. Polling cadence dropped from 15s → 5s, fetches are wrapped in retry/backoff, and all interpolated values are URL-encoded.

### If it still fails
Re-run AUTH-04 standalone: `@Trevor run auth-04`. The bash 5-min limit per command still applies, so giving each test its own bash invocation matters.

---

## Resolved: AUTH-01 reporting PARTIAL despite successful flow

### Symptom
AUTH-01 shows `PARTIAL` (code received, verification incomplete) even though the account is actually created.

### Root cause
After completing signup, ledgerlab.ai redirects to `/login` with a "Account created successfully!" banner — not to `/dashboard` or `/app`. The original success check only looked for those dashboard-style URLs, so the `/login` redirect fell through to a timing-sensitive body text scan.

### Fix
`auth-01-full-test.js` now explicitly handles the `/login` case: if the final URL contains `/login`, the test checks for "account created" or "success" in the page body before marking as passed.

---

## Running a debug session

Always use the managed agent runner — never run scripts directly:
```bash
cd managed-agent && npm run run -- "your debug task here"
```

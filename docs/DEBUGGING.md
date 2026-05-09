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

## Known flaky: AUTH-04 email delivery timing

### Symptom
AUTH-04 reports "reset code not received" after the 4-minute polling window, even though the reset flow UI completes successfully.

### Root cause
Guerrilla Mail email delivery time is variable. The bash tool in the managed agent has a 5-minute execution limit per command. When AUTH-04 runs as part of the full suite, it starts ~75s in (after AUTH-01's ~65s email wait), leaving just under 4 minutes of bash budget for the email poll — which is sometimes not enough.

### Fix applied
The agent system prompt requires each test to run as a separate bash command, giving AUTH-04 its own 5-minute budget. The `waitForCode` timeout is 4 minutes, which fits comfortably.

### If it fails
Re-run AUTH-04 standalone: `@Trevor run auth-04`. It nearly always passes on retry.

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

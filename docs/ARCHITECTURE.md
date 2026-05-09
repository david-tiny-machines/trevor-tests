# Trevor — Architecture

## Overview

Trevor is an Anthropic Managed Agents session that runs Playwright auth tests against [ledgerlab.ai](https://ledgerlab.ai) in a fresh cloud container on each run. It replaces a flaky persistent-container setup that suffered from zombie Chromium processes.

Each test run:
1. Creates a Managed Agents session (fresh container)
2. Sends Trevor a task via the events API
3. Streams output back to the terminal (or Slack)
4. Session terminates cleanly — no state leaks between runs

## Managed Agents concepts

| Concept | Trevor's usage |
|---------|----------------|
| **Agent** | `agent_01TEpf3NiuXfWxS47JLWa421` — Trevor's model, system prompt, and toolset |
| **Environment** | `env_01GxfCZyU9nUSUFUvj7dd8cc` — cloud container with pre-installed Chromium, Playwright, git |
| **Session** | One test run — ephemeral, isolated |
| **Events** | User message triggers the run; agent streams tool calls and results |

## Environment setup

The environment is created once via `setup-agent.js` and reused across sessions. Each session gets a fresh container instance but shares the pre-installed package cache.

The environment config must include:

```javascript
config: {
  type: 'cloud',
  packages: {
    apt: ['chromium', 'git'],
    npm: ['playwright'],
  },
  networking: { type: 'unrestricted' },
}
```

This pre-installs Chromium and Playwright so sessions only need to `git clone` the test scripts (fast) rather than downloading Playwright and its bundled Chromium binary at runtime (slow, causes timeout).

> **Note:** The original environment (`env_01Mhw9jnAwZLe2baxyz2vxmc`) was created without `packages`. Sessions timed out because `npm install` had to download the full Playwright + Chromium binary (~120MB) at runtime. A second environment (`env_014y7pEJd2vJ8kDaR1mFcB2i`) pre-installed these packages. The current environment (`env_01QScQn4ZXHRY16ZTVXUaBem`) was re-created alongside a new agent (`agent_01FB2ybheAnPzX3F8tAwRy1o`) to fix the system prompt which incorrectly referenced Mailinator instead of Guerrilla Mail.

## Session flow

```
run-session.js
  → client.beta.sessions.create(agentId, environmentId)
  → client.beta.sessions.events.stream(sessionId)    ← open stream first
  → client.beta.sessions.events.send(sessionId, userMessage)
  → for await (event of stream) { ... }              ← process until idle
```

The message asks Trevor to:
1. `git clone <TREVOR_REPO_URL> /workspace`
2. Run the requested test(s)

Trevor uses the `bash` tool to execute commands, and the `agent_toolset_20260401` gives it file operations, web fetch, and shell access.

## Test scripts

Scripts live in the `scripts/` directory of this repo and are also published to [david-tiny-machines/trevor-tests](https://github.com/david-tiny-machines/trevor-tests) (the URL Trevor clones inside the container).

| Script | What it tests |
|--------|---------------|
| `auth-01-full-test.js` | Full signup + email verification (Guerrilla Mail) |
| `auth-02-sign-in.js` | Login with valid credentials |
| `auth-03-invalid-credentials.js` | Wrong password rejected |
| `auth-04-forgot-password.js` | Full password reset flow (Guerrilla Mail) |
| `auth-05-duplicate-email.js` | Duplicate email rejected |
| `auth-06-logout.js` | Logout ends session |
| `auth-07-email-validation.js` | Invalid email formats rejected |
| `auth-08-session-persistence.js` | Session survives refresh |
| `run-regression-minimal.js` | Quick smoke test (subset, single browser) |
| `mail-helper.js` | Guerrilla Mail REST API wrapper (used by auth-01, auth-04) |

Scripts use Playwright's bundled Chromium via `launch-browser.js` (headless, no `executablePath` override). Failure screenshots saved to `/workspace/screenshots/`.

## Email testing

AUTH-01 and AUTH-04 need to read verification codes from inbound email. The managed agent container blocks WebSocket connections (`wss://`), so Mailinator's browser-based inbox cannot be used. Instead, `mail-helper.js` uses the **Guerrilla Mail REST API**:

1. `createInbox(prefix)` — creates a session, sets the email address to `{prefix}@guerrillamailblock.com`
2. `waitForCode(sid_token, subjectKeyword)` — polls every 15s for up to 4 minutes, extracts the 6-digit code

No API key required. LedgerLab delivers to `guerrillamailblock.com`.

## Slack integration

`slack-trigger.js` is an Express server that handles a Slack slash command `/trevor`. It:
1. Responds to Slack within 3 seconds (required)
2. Fires a Trevor session asynchronously
3. Posts results back to the Slack channel via `chat.postMessage`

Deployed to Railway at `trevor-tests-production.up.railway.app`. The slash command URL is `https://trevor-tests-production.up.railway.app/slack/trevor`. The bot must be invited to any channel it posts to (`/invite @Trevor`).

Two gotchas resolved during setup:
- Raw body must be captured via Express `verify` callback (not a separate streaming middleware) so `req.body` is still populated for urlencoded parsing
- The SDK stream does not close when the session goes idle — must `break` on `session.status_idle` or the stream hangs indefinitely

## SDK notes

SDK version: `@anthropic-ai/sdk@0.95.1`

All Managed Agents requests automatically include the `managed-agents-2026-04-01` beta header when using the SDK. Stream must be opened before sending the user message — the API buffers events until the stream attaches.

Session statuses: `idle` → `running` → `idle` (done) or `terminated` (unrecoverable error).

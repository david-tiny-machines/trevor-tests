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

> **History:** The original environment (`env_01Mhw9jnAwZLe2baxyz2vxmc`) was created without `packages` — sessions timed out downloading Playwright + Chromium (~120MB) at runtime. Subsequent re-creations fixed the system prompt (Mailinator → Guerrilla Mail) and added the rule that each test script must be run as a separate bash command — the bash tool has a 5-minute execution limit, and running the full suite as one command left AUTH-04 with insufficient budget to wait for its reset email.

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
2. `waitForCode(sid_token, subjectKeyword)` — polls every 5s for up to 4 minutes, extracts the 6-digit code

`waitForCode` tracks the highest `mail_id` seen and uses it as the polling cursor, so older emails (e.g. an `Activate` message from signup) cannot satisfy a later wait for the same subject keyword (e.g. an `Activate`-prefixed reset email). At entry it also baselines the inbox, ignoring anything already present.

No API key required. LedgerLab delivers to `guerrillamailblock.com`.

## Slack integration

`slack-trigger.js` is an Express server deployed to Railway at `trevor-tests-production.up.railway.app`. It supports two trigger methods:

- **Slash command** `/trevor <task>` — endpoint: `/slack/trevor`
- **App mention** `@Trevor <task>` — endpoint: `/slack/events` (Slack Events API, `app_mention` event)

Both respond to Slack within 3 seconds, fire a Trevor session asynchronously, and post results back as threaded replies via `chat.postMessage`. The bot must be invited to any channel it posts to (`/invite @Trevor`).

Reliability features:
- **Boot-time env validation** — refuses to start if any of `ANTHROPIC_API_KEY`, `TREVOR_AGENT_ID`, `TREVOR_ENVIRONMENT_ID`, `TREVOR_REPO_URL`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` are unset. Closes the "signature check silently skipped" hole.
- **Concurrency cap** — `TREVOR_MAX_CONCURRENT` (default 2) sessions in flight; overflow gets a friendly Slack reply rather than spawning unbounded sessions.
- **Session timeout** — `TREVOR_SESSION_TIMEOUT_MS` (default 20 min) bounds each session via `Promise.race`. The 5-minute bash limit only caps a single tool call inside the container, not the whole session.
- **Output buffering** — agent stream chunks accumulate for ~1.5s or 3500 chars before posting to Slack, so streaming output isn't fragmented across dozens of messages and doesn't trip rate limits.
- **Slack retry/backoff** — `chat.postMessage` retries on 429 (honoring `Retry-After`), network errors, and transient Slack errors.
- **Event deduplication** — `event_id` (Events API) and `trigger_id` (slash commands) are remembered for 10 minutes on top of the `x-slack-retry-num` header check.
- **Graceful shutdown** — SIGTERM/SIGINT close the HTTP server before exit so Railway redeploys don't drop in-flight responses.

Gotchas resolved during setup:
- Raw body must be captured via Express `verify` callback (not a separate streaming middleware) so `req.body` is still populated for urlencoded parsing
- The SDK stream does not close when the session goes idle — must `break` on `session.status_idle` or the stream hangs indefinitely
- `crypto.timingSafeEqual` throws on length mismatch — length-check the buffers first to avoid handler-killing throws on malformed signatures

## SDK notes

SDK version: `@anthropic-ai/sdk@0.95.1`

All Managed Agents requests automatically include the `managed-agents-2026-04-01` beta header when using the SDK. Stream must be opened before sending the user message — the API buffers events until the stream attaches.

Session statuses: `idle` → `running` → `idle` (done) or `terminated` (unrecoverable error).

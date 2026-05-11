# Trevor — Claude Code Handoff

## What We're Building

A regression testing agent called **Trevor** that runs Playwright auth tests against `https://ledgerlab.ai` using Anthropic's **Managed Agents** API.

Trevor replaces an existing OpenClaw/Railway setup that was flaky due to zombie Chromium processes from persistent containers. Managed Agents solves this by giving each test run a fresh container.

---

## Current Status

- ✅ Test scripts written and pushed to GitHub
- ✅ Managed agent and environment created and reused
- ✅ Slack integration deployed to Railway
- ✅ Suite-style requests run AUTH-01 through AUTH-08 as separate managed-agent bash commands
- ✅ All 8 auth tests passing in the managed-agent container as of 2026-05-11
- ✅ AUTH-01 hardened around OTP/password-step timing and account readiness

---

## Repo

**Test scripts:** https://github.com/david-tiny-machines/trevor-tests

Structure:
```
scripts/
  auth-01-full-test.js          # Full signup + email verification
  auth-02-sign-in.js            # Login with valid credentials
  auth-03-invalid-credentials.js
  auth-04-forgot-password.js
  auth-05-duplicate-email.js
  auth-06-logout.js
  auth-07-email-validation.js
  auth-08-session-persistence.js
  run-regression-minimal.js     # Quick smoke test (single browser)
  api-health-check.sh           # Curl-based health check, no browser
package.json                    # playwright dependency
managed-agent/
  setup-agent.js                # Already run — created agent + environment
  run-session.js                # Starts managed-agent sessions and streams output
```

---

## Environment Variables Needed

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
export TREVOR_AGENT_ID=agent_011CapZ7pdHqxQFsuDhvAaau
export TREVOR_ENVIRONMENT_ID=env_01Mhw9jnAwZLe2baxyz2vxmc
export TREVOR_REPO_URL=https://github.com/david-tiny-machines/trevor-tests
export LEDGERLAB_TEST_EMAIL=ledgerlab-test-1769824520783@mailinator.com
export LEDGERLAB_TEST_PASSWORD=TestPass123!
```

---

## Key Docs

- **Managed Agents overview:** https://platform.claude.com/docs/en/managed-agents/overview
- **Anthropic SDK (TypeScript):** https://github.com/anthropics/anthropic-sdk-node
- **SDK version installed:** `@anthropic-ai/sdk@0.95.1`

---

## What We Know About the SDK

The streaming API shape (discovered via inspection):

```javascript
// client.beta.sessions.events has: list, send, stream
// stream() returns a Promise — must await it
const stream = await client.beta.sessions.events.stream(sessionId);
// Awaited stream has: tee, toReadableStream, [Symbol.asyncIterator]
// So async iteration works:
for await (const event of stream) { ... }
```

Session creation:
```javascript
const session = await client.beta.sessions.create({
  agent: AGENT_ID,          // note: 'agent' not 'agent_id'
  environment_id: ENVIRONMENT_ID,
  title: 'Trevor smoke test',
});
```

Sending a message:
```javascript
await client.beta.sessions.events.send(sessionId, {
  events: [{
    type: 'user.message',
    content: [{ type: 'text', text: 'your message here' }],
  }],
});
```

---

## Resolved Historical Problem

Early sessions failed while cloning/installing inside the managed-agent container. The current flow works:

1. `run-session.js` creates a fresh managed-agent session.
2. Trevor clones `TREVOR_REPO_URL` into `/workspace`.
3. Dependencies and Chromium are installed.
4. Requested tests run from `/workspace`.

The remaining reliability rule is operational: full regression runs must execute AUTH-01 through AUTH-08 as separate bash commands, not through a suite wrapper, so each test gets its own execution budget.

---

## What To Preserve

1. **Fresh container per run** — avoids persistent Chromium/process state.
2. **Guerrilla Mail REST polling** — avoids Mailinator WebSocket issues in the container.
3. **Separate bash command per auth script** — avoids the 5-minute bash-command budget cutting off email-dependent tests.
4. **AUTH-01 credential handoff** — downstream account-dependent tests use `/tmp/trevor-test-account.json`.
   - Or use the Files API to upload scripts directly

2. **Get Chromium working** — scripts use `/usr/bin/chromium`. The environment setup_commands include `apt-get install -y chromium` but unclear if that ran correctly given the environment was created with:
   ```javascript
   config: {
     type: 'cloud',
     networking: { type: 'unrestricted' },
   }
   ```
   The `setup_commands` were accidentally left off the environment — they were only on the session. This may be the root cause.

3. **Clean up run-session.js** — once working, remove debug logging and make it production-ready.

---

## Current run-session.js

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_ID = process.env.TREVOR_AGENT_ID;
const ENVIRONMENT_ID = process.env.TREVOR_ENVIRONMENT_ID;
const REPO_URL = process.env.TREVOR_REPO_URL;

const task = process.argv[2] || 'run the smoke test and report results';

async function main() {
  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
    title: `Trevor: ${task.slice(0, 50)}`,
  });

  const stream = await client.beta.sessions.events.stream(session.id);

  await client.beta.sessions.events.send(session.id, {
    events: [{
      type: 'user.message',
      content: [{ type: 'text', text: `First run: git clone ${REPO_URL} /workspace && cd /workspace && npm install\nThen: ${task}` }],
    }],
  });

  for await (const event of stream) {
    if (event.type === 'agent.message') {
      for (const block of event.content || []) {
        if (block.text) process.stdout.write(block.text);
      }
    } else if (event.type === 'session.status_idle') {
      break;
    }
  }
}

main().catch(console.error);
```

---

## Suggested Next Steps for Claude Code

1. Keep `managed-agent/system-prompt.js`, `run-session.js`, and `slack-trigger.js` aligned when changing suite behavior.
2. If the prompt/model changes, run `cd managed-agent && npm run update` to update the existing managed agent.
3. If test scripts change, push to `main`, wait for Railway deploy, then run Trevor from Slack or `managed-agent`.
4. Verify the smoke test with `npm run run -- "run the smoke test"` when changing setup/browser behavior.
5. Verify the full suite by asking Trevor to "run the full regression suite"; it should run AUTH-01 through AUTH-08 as separate bash commands.

---

## End Goal

A reliable `run-session.js` that:
- Creates a session
- Gets the test scripts into the container (via setup_commands or Files API)
- Sends Trevor a task
- Streams output back to the terminal
- Exits cleanly when done

Eventually this becomes a Slack slash command trigger — but get the core working first.

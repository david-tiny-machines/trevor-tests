# Trevor — Claude Code Handoff

## What We're Building

A regression testing agent called **Trevor** that runs Playwright auth tests against `https://ledgerlab.ai` using Anthropic's **Managed Agents** API.

Trevor replaces an existing OpenClaw/Railway setup that was flaky due to zombie Chromium processes from persistent containers. Managed Agents solves this by giving each test run a fresh container.

---

## Current Status

- ✅ Test scripts written and pushed to GitHub
- ✅ Agent created: `agent_011CapZ7pdHqxQFsuDhvAaau`
- ✅ Environment created: `env_01Mhw9jnAwZLe2baxyz2vxmc`
- ✅ Sessions create successfully and Trevor responds
- ❌ `git clone` inside the session container times out or fails
- ❌ Session terminates with `Error: terminated` before tests run

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
  run-session.js                # The broken bit — needs fixing
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

## The Problem

When Trevor receives the message, it tries to `git clone https://github.com/david-tiny-machines/trevor-tests /workspace` inside the container but times out. Possible causes:

1. **Network access** — environment may need `networking: { type: 'unrestricted' }` config (already set in setup but unsure if it applied)
2. **Wrong workspace path** — `/workspace` may not be writable or may not exist
3. **Session timeout** — default session timeout may be too short for clone + npm install + chromium install + test run
4. **Setup commands** — the `setup_commands` field on session creation might be the right way to run init rather than asking Trevor to do it in the message

The last session that failed:
```
Session: sesn_011CapZgJxG3RW3MtR3Fe9Ji
Trevor said: "The git clone + npm install timed out. Let me try a different approach"
Then: "The directory is empty"
Then: terminated
```

---

## What Needs Fixing

1. **Get the test scripts into the container** — either via:
   - `setup_commands` on session create (preferred — runs before Trevor starts)
   - Fixing whatever is blocking git clone
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

1. Read the Managed Agents docs at the URL above
2. Check whether `setup_commands` belongs on the environment, the session, or both
3. Try recreating the environment with `setup_commands` included (Chromium install)
4. Try passing `setup_commands` on session create to handle the git clone
5. If git clone keeps failing, try the Files API to upload scripts directly
6. Verify the smoke test runs: `node scripts/run-regression-minimal.js` — it uses a single Chromium process and should complete in ~30 seconds
7. Once smoke test works, verify the full suite by running AUTH-01 through AUTH-08 as separate bash commands. Do not use a suite wrapper; each test needs its own managed-agent execution budget.

---

## End Goal

A reliable `run-session.js` that:
- Creates a session
- Gets the test scripts into the container (via setup_commands or Files API)
- Sends Trevor a task
- Streams output back to the terminal
- Exits cleanly when done

Eventually this becomes a Slack slash command trigger — but get the core working first.

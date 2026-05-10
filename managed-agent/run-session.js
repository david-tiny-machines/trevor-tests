import Anthropic from '@anthropic-ai/sdk';

const REQUIRED = ['ANTHROPIC_API_KEY', 'TREVOR_AGENT_ID', 'TREVOR_ENVIRONMENT_ID'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AGENT_ID = process.env.TREVOR_AGENT_ID;
const ENVIRONMENT_ID = process.env.TREVOR_ENVIRONMENT_ID;
const REPO_URL = process.env.TREVOR_REPO_URL;
const SESSION_TIMEOUT_MS = Number(process.env.TREVOR_SESSION_TIMEOUT_MS || 20 * 60 * 1000);

const FULL_AUTH_SUITE_TASK = `Run the full auth regression suite. Run each auth test script individually in sequence as its own separate bash command/tool call, and report a result after each one. Do not run npm test. Do not use a suite script. Do not chain commands with &&, ;, or loops.
node scripts/auth-01-full-test.js
node scripts/auth-02-sign-in.js
node scripts/auth-03-invalid-credentials.js
node scripts/auth-04-forgot-password.js
node scripts/auth-05-duplicate-email.js
node scripts/auth-06-logout.js
node scripts/auth-07-email-validation.js
node scripts/auth-08-session-persistence.js
After all tests, provide a final summary table with exactly 8 rows. If any AUTH-01 through AUTH-08 row is missing, report the suite as incomplete.`;

function normalizeTask(input) {
  const text = (input || '').trim();
  if (!text) return FULL_AUTH_SUITE_TASK;

  const lower = text.toLowerCase();
  const wantsSuite = (lower.includes('regression') || lower.includes('full') || lower.includes('auth')) &&
                     (lower.includes('suite') || lower.includes('all tests') || lower.includes('all auth'));
  if (wantsSuite) return FULL_AUTH_SUITE_TASK;

  return text;
}

const task = normalizeTask(process.argv[2]);

async function main() {
  console.log(`Starting Trevor: "${task}"\n${'─'.repeat(60)}`);

  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
    title: `Trevor: ${task.slice(0, 50)}`,
  });

  console.log(`Session: ${session.id}\n`);

  const stream = await client.beta.sessions.events.stream(session.id);

  const cloneStep = REPO_URL
    ? `git clone --depth 1 ${REPO_URL} /workspace && cd /workspace && npm install && (npx playwright install chromium 2>/dev/null || apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium 2>/dev/null) && `
    : '';

  const message = cloneStep
    ? `Run this setup command first: ${cloneStep}mkdir -p /workspace/screenshots\n\nThen: ${task}`
    : task;

  await client.beta.sessions.events.send(session.id, {
    events: [{
      type: 'user.message',
      content: [{ type: 'text', text: message }],
    }],
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Session exceeded ${SESSION_TIMEOUT_MS / 1000}s timeout`)), SESSION_TIMEOUT_MS).unref()
  );

  const consumePromise = (async () => {
    for await (const event of stream) {
      switch (event.type) {
        case 'agent.message':
          for (const block of event.content ?? []) {
            if (block.text) process.stdout.write(block.text);
          }
          break;
        case 'agent.tool_use':
          process.stdout.write(`\n[${event.name}]\n`);
          break;
        case 'session.status_idle':
          console.log(`\n${'─'.repeat(60)}\nDone`);
          return;
        case 'session.status_terminated':
          throw new Error(`Session terminated: ${JSON.stringify(event)}`);
      }
    }
  })();

  await Promise.race([consumePromise, timeoutPromise]);
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});

import express from 'express';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const REQUIRED_ENV = [
  'ANTHROPIC_API_KEY',
  'TREVOR_AGENT_ID',
  'TREVOR_ENVIRONMENT_ID',
  'TREVOR_REPO_URL',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AGENT_ID = process.env.TREVOR_AGENT_ID;
const ENVIRONMENT_ID = process.env.TREVOR_ENVIRONMENT_ID;
const REPO_URL = process.env.TREVOR_REPO_URL;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

const MAX_CONCURRENT_SESSIONS = Number(process.env.TREVOR_MAX_CONCURRENT || 2);
const SESSION_TIMEOUT_MS = Number(process.env.TREVOR_SESSION_TIMEOUT_MS || 20 * 60 * 1000);
const SLACK_FLUSH_MS = 1500;
const SLACK_MAX_CHARS = 3500;
const FULL_AUTH_SUITE_DISPLAY = 'Run the full auth regression suite';
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

let activeSessions = 0;
const seenEventIds = new Map(); // event_id -> insertedAt
const DEDUP_TTL_MS = 10 * 60 * 1000;

function normalizeTask(input) {
  const text = (input || '').trim();
  if (!text) return { displayText: FULL_AUTH_SUITE_DISPLAY, agentText: FULL_AUTH_SUITE_TASK };

  const lower = text.toLowerCase();
  const wantsSuite = (lower.includes('regression') || lower.includes('full') || lower.includes('auth')) &&
                     (lower.includes('suite') || lower.includes('all tests') || lower.includes('all auth'));
  if (wantsSuite) return { displayText: text, agentText: FULL_AUTH_SUITE_TASK };

  return { displayText: text, agentText: text };
}

function rememberEventId(id) {
  const now = Date.now();
  for (const [k, t] of seenEventIds) if (now - t > DEDUP_TTL_MS) seenEventIds.delete(k);
  if (seenEventIds.has(id)) return false;
  seenEventIds.set(id, now);
  return true;
}

function verifySlackSignature(req) {
  try {
    const timestamp = req.headers['x-slack-request-timestamp'];
    const signature = req.headers['x-slack-signature'];
    if (!timestamp || !signature || typeof signature !== 'string') return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    const base = `v0:${timestamp}:${req.rawBody}`;
    const expected = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(base).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    console.error('Signature verification error:', err.message);
    return false;
  }
}

const app = express();
app.use(express.urlencoded({
  extended: true,
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));

async function postToSlack(channel, text, thread_ts = null, { retries = 3 } = {}) {
  const body = { channel, text };
  if (thread_ts) body.thread_ts = thread_ts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error(`Slack network error (attempt ${attempt + 1}):`, err.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 1;
      console.warn(`Slack 429, sleeping ${retryAfter}s`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    const json = await res.json().catch(() => ({}));
    if (json.ok) return json;
    console.error('Slack post failed:', JSON.stringify(json));
    if (!['ratelimited', 'service_unavailable', 'internal_error'].includes(json.error)) return json;
    if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  return { ok: false };
}

// Buffer streaming agent output and flush in chunks so we don't fragment a
// reply across dozens of tiny Slack messages (and trip rate limits).
function makeSlackBuffer(channel, thread_ts) {
  let buffer = '';
  let timer = null;

  async function flushNow() {
    if (timer) { clearTimeout(timer); timer = null; }
    const text = buffer.trim();
    buffer = '';
    if (text) await postToSlack(channel, text, thread_ts);
  }

  function append(chunk) {
    if (!chunk) return;
    buffer += chunk;
    if (buffer.length >= SLACK_MAX_CHARS) {
      // Send what we have immediately to avoid exceeding Slack's 4000-char limit.
      void flushNow();
      return;
    }
    if (!timer) timer = setTimeout(() => { void flushNow(); }, SLACK_FLUSH_MS);
  }

  return { append, flush: flushNow };
}

async function runTrevorSession(task, channel) {
  if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
    await postToSlack(channel, `⚠️ Trevor is busy (${activeSessions} session(s) running). Please retry shortly.`);
    return;
  }
  activeSessions++;

  let thread_ts = null;
  let buffer = null;
  let timeoutHandle = null;
  let timedOut = false;

  try {
    const start = await postToSlack(channel, `🧪 Trevor starting: _${task.displayText}_`);
    thread_ts = start.ts || null;
    buffer = makeSlackBuffer(channel, thread_ts);

    const cloneStep = `git clone --depth 1 ${REPO_URL} /workspace && cd /workspace && npm install && (npx playwright install chromium 2>/dev/null || apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium 2>/dev/null) && mkdir -p /workspace/screenshots`;

    const session = await client.beta.sessions.create({
      agent: AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      title: `Trevor: ${task.displayText.slice(0, 50)}`,
    });
    console.log('Session created:', session.id);

    const stream = await client.beta.sessions.events.stream(session.id);

    await client.beta.sessions.events.send(session.id, {
      events: [{
        type: 'user.message',
        content: [{ type: 'text', text: `Run this setup command first: ${cloneStep}\n\nThen: ${task.agentText}` }],
      }],
    });

    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        reject(new Error(`Session exceeded ${SESSION_TIMEOUT_MS / 1000}s timeout`));
      }, SESSION_TIMEOUT_MS);
    });

    const consumePromise = (async () => {
      for await (const event of stream) {
        if (timedOut) break;
        if (event.type === 'agent.message') {
          const text = (event.content ?? []).filter(b => b.text).map(b => b.text).join('');
          buffer.append(text);
        }
        if (event.type === 'session.status_idle' || event.type === 'session.status_terminated') {
          if (event.type === 'session.status_terminated') {
            console.error('Session terminated:', JSON.stringify(event));
            buffer.append(`\n⚠️ Session terminated unexpectedly.`);
          }
          break;
        }
      }
    })();

    await Promise.race([consumePromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    await buffer.flush();
    console.log('Stream ended for session', session.id);

  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    console.error('Trevor session error:', err);
    if (buffer) await buffer.flush();
    await postToSlack(channel, `❌ Trevor error: ${err.message}`, thread_ts);
  } finally {
    activeSessions--;
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, agent: AGENT_ID, active: activeSessions }));

app.post('/slack/trevor', (req, res) => {
  if (!verifySlackSignature(req)) return res.status(401).json({ error: 'Invalid signature' });

  const { text, channel_id, trigger_id } = req.body;
  if (!channel_id) return res.status(400).json({ error: 'Invalid request' });

  // Slash commands carry trigger_id; use it to dedupe accidental retries.
  if (trigger_id && !rememberEventId(`cmd:${trigger_id}`)) return res.sendStatus(200);

  const task = normalizeTask(text);
  res.sendStatus(200);
  runTrevorSession(task, channel_id).catch(err => console.error('Unhandled session error:', err));
});

app.post('/slack/events', (req, res) => {
  if (!verifySlackSignature(req)) return res.status(401).json({ error: 'Invalid signature' });

  const { type, challenge, event, event_id } = req.body;
  if (type === 'url_verification') return res.json({ challenge });

  // Belt and suspenders: the retry-num header catches most retries, event_id dedup
  // catches the rest (rare backend retries that arrive without the header).
  if (req.headers['x-slack-retry-num']) return res.sendStatus(200);
  if (event_id && !rememberEventId(`evt:${event_id}`)) return res.sendStatus(200);

  if (type === 'event_callback' && event?.type === 'app_mention') {
    const channel = event.channel;
    const task = normalizeTask(event.text.replace(/^<@[^>]+>\s*/, ''));

    res.sendStatus(200);
    runTrevorSession(task, channel).catch(err => console.error('Unhandled session error:', err));
    return;
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Trevor Slack trigger on :${PORT} — agent ${AGENT_ID}`);
});

function shutdown(signal) {
  console.log(`${signal} received; draining (active sessions: ${activeSessions})`);
  server.close(() => process.exit(0));
  // Hard exit if sessions don't drain in time — Railway sends SIGKILL after ~30s anyway.
  setTimeout(() => process.exit(0), 25000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

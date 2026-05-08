/**
 * Trevor - Slack Webhook Trigger
 * 
 * A minimal Express server that receives Slack slash commands
 * and triggers Trevor test sessions.
 * 
 * Setup in Slack: Create a slash command /trevor pointing to
 * https://your-domain/slack/trevor
 * 
 * Usage in Slack:
 *   /trevor run tests
 *   /trevor smoke test
 *   /trevor run auth-02 and auth-03
 */
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_ID = process.env.TREVOR_AGENT_ID;
const ENVIRONMENT_ID = process.env.TREVOR_ENVIRONMENT_ID;
const BETA_HEADER = 'managed-agents-2026-04-01';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const REPO_URL = process.env.TREVOR_REPO_URL;

async function postToSlack(channel, text) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  });
  return res.json();
}

async function runTrevorSession(task, slackChannel, slackResponseUrl) {
  try {
    // Acknowledge immediately to Slack (must respond within 3s)
    await fetch(slackResponseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🧪 Trevor is on it: _${task}_` }),
    });

    const initCommand = REPO_URL
      ? `git clone ${REPO_URL} /workspace && cd /workspace && npm install --silent && mkdir -p /workspace/screenshots`
      : `mkdir -p /workspace/screenshots`;

    const session = await client.beta.managedAgents.sessions.create({
      agent_id: AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      input: task,
      environment_variables: {
        LEDGERLAB_TEST_EMAIL: process.env.LEDGERLAB_TEST_EMAIL || '',
        LEDGERLAB_TEST_PASSWORD: process.env.LEDGERLAB_TEST_PASSWORD || '',
      },
      setup_commands: [initCommand],
    }, {
      headers: { 'anthropic-beta': BETA_HEADER }
    });

    // Collect full output
    const stream = await client.beta.managedAgents.sessions.stream(session.id, {
      headers: { 'anthropic-beta': BETA_HEADER }
    });

    let fullOutput = '';
    for await (const event of stream) {
      if (event.type === 'text') fullOutput += event.text;
    }

    // Post results back to Slack
    // Truncate if needed (Slack has a 3000 char limit per block)
    const MAX_LEN = 2800;
    const truncated = fullOutput.length > MAX_LEN
      ? fullOutput.slice(-MAX_LEN) + '\n_(truncated — see full output in logs)_'
      : fullOutput;

    await postToSlack(slackChannel, `🧪 *Trevor results:*\n\`\`\`\n${truncated}\n\`\`\``);

  } catch (err) {
    console.error('Trevor session error:', err);
    await postToSlack(slackChannel, `❌ Trevor encountered an error: ${err.message}`);
  }
}

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, agent: AGENT_ID }));

// Slack slash command handler
app.post('/slack/trevor', async (req, res) => {
  const { text, channel_id, response_url } = req.body;

  // Validate it's from Slack (add signing secret verification in prod)
  if (!channel_id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const task = text?.trim() || 'run the full regression suite';

  // Must respond within 3 seconds - fire and forget the actual work
  res.json({ response_type: 'in_channel', text: `🧪 Trevor starting: _${task}_` });

  // Run async
  runTrevorSession(task, channel_id, response_url).catch(console.error);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Trevor Slack trigger listening on :${PORT}`);
  console.log(`Agent: ${AGENT_ID}`);
  console.log(`Environment: ${ENVIRONMENT_ID}`);
});

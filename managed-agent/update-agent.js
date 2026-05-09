import Anthropic from '@anthropic-ai/sdk';
import { TREVOR_SYSTEM_PROMPT, TREVOR_MODEL } from './system-prompt.js';

const REQUIRED = ['ANTHROPIC_API_KEY', 'TREVOR_AGENT_ID'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AGENT_ID = process.env.TREVOR_AGENT_ID;

async function main() {
  const current = await client.beta.agents.retrieve(AGENT_ID);
  console.log(`Current version: ${current.version} (model=${current.model?.id})`);
  console.log(`Updating to model=${TREVOR_MODEL}...`);
  const agent = await client.beta.agents.update(AGENT_ID, {
    version: current.version,
    model: TREVOR_MODEL,
    system: TREVOR_SYSTEM_PROMPT,
  });
  console.log(`✅ Updated. New version: ${agent.version}`);
}

main().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});

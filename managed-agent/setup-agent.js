import Anthropic from '@anthropic-ai/sdk';
import { TREVOR_SYSTEM_PROMPT, TREVOR_MODEL } from './system-prompt.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  console.log('Creating Trevor agent...');
  const agent = await client.beta.agents.create({
    name: 'trevor',
    model: TREVOR_MODEL,
    system: TREVOR_SYSTEM_PROMPT,
    tools: [{ type: 'agent_toolset_20260401' }],
  });
  console.log('✅ Agent created:', agent.id);

  console.log('Creating environment...');
  const env = await client.beta.environments.create({
    name: 'trevor-env-v2',
    config: {
      type: 'cloud',
      packages: {
        apt: ['chromium', 'git'],
        npm: ['playwright'],
      },
      networking: { type: 'unrestricted' },
    },
  });
  console.log('✅ Environment created:', env.id);

  console.log('\n📋 Save these to your environment:');
  console.log(`export TREVOR_AGENT_ID=${agent.id}`);
  console.log(`export TREVOR_ENVIRONMENT_ID=${env.id}`);
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});

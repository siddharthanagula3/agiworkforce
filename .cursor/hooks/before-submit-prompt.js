#!/usr/bin/env node
const { readStdin } = require('./adapter');
readStdin().then(raw => {
  try {
    const input = JSON.parse(raw);
    const prompt = input.prompt || input.content || input.message || '';
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,       // OpenAI / Anthropic API keys
      /ghp_[a-zA-Z0-9]{36,}/,      // GitHub personal access tokens
      /AKIA[A-Z0-9]{16}/,          // AWS access keys
      /xox[bpsa]-[a-zA-Z0-9-]+/,   // Slack tokens
      /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // Private keys
      /sk-ant-[a-zA-Z0-9-]+/,      // Anthropic API keys
      /gsk_[a-zA-Z0-9]{20,}/,      // Groq API keys
      /supabase_[a-zA-Z0-9]+/,     // Supabase tokens
    ];
    for (const pattern of secretPatterns) {
      if (pattern.test(prompt)) {
        console.error('[AGI] WARNING: Potential secret detected in prompt!');
        console.error('[AGI] Remove secrets before submitting. Use environment variables or SecretManager instead.');
        break;
      }
    }
  } catch {}
  process.stdout.write(raw);
}).catch(() => process.exit(0));

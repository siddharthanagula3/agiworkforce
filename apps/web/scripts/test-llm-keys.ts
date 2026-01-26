#!/usr/bin/env npx tsx
/**
 * Test script to verify LLM API keys are configured and working
 * Run with: npx tsx apps/web/scripts/test-llm-keys.ts
 */

import 'dotenv/config';

const providers = [
  {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    testUrl: 'https://api.openai.com/v1/models',
    getHeaders: (key: string) => ({
      Authorization: `Bearer ${key}`,
    }),
  },
  {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    testUrl: 'https://api.anthropic.com/v1/messages',
    getHeaders: (key: string) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    // Anthropic requires a POST request with a body
    testBody: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
    method: 'POST',
  },
  {
    name: 'Google',
    envKey: 'GOOGLE_API_KEY',
    testUrl: 'https://generativelanguage.googleapis.com/v1beta/models?key=',
    isQueryParam: true,
  },
];

async function testProvider(provider: (typeof providers)[0]) {
  const key = process.env[provider.envKey];

  console.log(`\n--- ${provider.name} ---`);

  if (!key) {
    console.log(`❌ ${provider.envKey} is NOT configured`);
    return { name: provider.name, status: 'not_configured' };
  }

  // Mask key for display
  const maskedKey =
    key.length > 12 ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}` : '[short key]';
  console.log(`✓ ${provider.envKey} is configured: ${maskedKey} (${key.length} chars)`);

  // Test API connection
  try {
    let url = provider.testUrl;
    const headers: Record<string, string> = provider.getHeaders?.(key) || {};

    if (provider.isQueryParam) {
      url += key;
    }

    console.log(`  Testing API connection...`);

    const response = await fetch(url, {
      method: provider.method || 'GET',
      headers,
      body: provider.testBody,
    });

    if (response.ok) {
      console.log(`  ✓ API connection successful (status ${response.status})`);
      return { name: provider.name, status: 'working' };
    } else {
      const errorText = await response.text();
      console.log(`  ❌ API error (status ${response.status})`);

      // Check for specific error types
      if (response.status === 401) {
        console.log(`  ⚠️ Authentication failed - key may be invalid or expired`);
      } else if (response.status === 429) {
        console.log(`  ⚠️ Rate limited - too many requests`);
      } else {
        console.log(`  Error: ${errorText.substring(0, 200)}`);
      }
      return { name: provider.name, status: 'error', code: response.status };
    }
  } catch (error) {
    console.log(`  ❌ Connection failed: ${error instanceof Error ? error.message : error}`);
    return { name: provider.name, status: 'connection_error' };
  }
}

async function main() {
  console.log('=== LLM API Key Verification ===');
  console.log(`Environment: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`Total env vars: ${Object.keys(process.env).length}`);
  console.log(
    `API key env vars: ${Object.keys(process.env)
      .filter((k) => k.includes('API_KEY'))
      .join(', ')}`,
  );

  const results = [];
  for (const provider of providers) {
    results.push(await testProvider(provider));
  }

  console.log('\n=== Summary ===');
  for (const result of results) {
    const emoji =
      result.status === 'working' ? '✓' : result.status === 'not_configured' ? '○' : '✗';
    console.log(`${emoji} ${result.name}: ${result.status}`);
  }
}

main().catch(console.error);

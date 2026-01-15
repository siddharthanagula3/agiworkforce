/* global fetch, console, setTimeout, process, TextDecoder, crypto, module, require */
/**
 * AGI Workforce API - JavaScript Examples
 * These examples work in both Node.js and modern browsers
 */

const BASE_URL = 'https://agiworkforce.com/api';
const TOKEN = 'YOUR_JWT_TOKEN_HERE';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Make an authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Log rate limit info
  console.log('Rate Limit:', {
    limit: response.headers.get('X-RateLimit-Limit'),
    remaining: response.headers.get('X-RateLimit-Remaining'),
    reset: response.headers.get('X-RateLimit-Reset'),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Retry request with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = Math.pow(2, i) * 1000;
      console.log(`Retry ${i + 1}/${maxRetries} in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ============================================================================
// User Management
// ============================================================================

async function getCurrentUser() {
  console.log('🔍 Getting current user...');
  const user = await apiRequest('/me');
  console.log('User:', user);
  return user;
}

// ============================================================================
// LLM API
// ============================================================================

async function getCreditBalance() {
  console.log('💰 Getting credit balance...');
  const balance = await apiRequest('/llm/v1/credits/balance');
  console.log('Balance:', balance);
  return balance;
}

async function listModels() {
  console.log('📋 Listing available models...');
  const response = await apiRequest('/llm/v1/models');
  console.log(`Found ${response.data.length} models`);
  return response.data;
}

async function createChatCompletion(messages, options = {}) {
  console.log('💬 Creating chat completion...');

  const body = {
    model: options.model || 'gpt-4',
    messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 1000,
    stream: options.stream || false,
    use_prompt_cache: options.usePromptCache || false,
  };

  const response = await apiRequest('/llm/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  console.log('Completion:', response);
  return response;
}

async function streamChatCompletion(messages, options = {}) {
  console.log('🌊 Streaming chat completion...');

  const body = {
    model: options.model || 'gpt-4',
    messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 1000,
    stream: true,
  };

  const response = await fetch(`${BASE_URL}/llm/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            process.stdout.write(content); // Stream to console
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  console.log('\n');
  return fullContent;
}

// ============================================================================
// Device Management
// ============================================================================

async function generateDeviceLinkCode(deviceInfo) {
  console.log('🔗 Generating device link code...');

  const response = await fetch(`${BASE_URL}/device/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deviceInfo),
  });

  const data = await response.json();
  console.log('Link Code:', data.link_code);
  console.log('Verify URL:', data.verify_url);
  return data;
}

async function pollDeviceStatus(deviceId, maxAttempts = 30) {
  console.log('⏳ Polling device status...');

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s

    const response = await fetch(`${BASE_URL}/device/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
    });

    const data = await response.json();
    console.log(`Attempt ${i + 1}: Status = ${data.status}`);

    if (data.status === 'authorized') {
      console.log('✅ Device authorized!');
      return data;
    } else if (data.status === 'denied') {
      throw new Error('Device authorization denied');
    } else if (data.status === 'expired') {
      throw new Error('Device link code expired');
    }
  }

  throw new Error('Polling timeout');
}

// ============================================================================
// Subscription Management
// ============================================================================

async function createCheckoutSession(plan, billingInterval) {
  console.log(`💳 Creating checkout for ${plan} (${billingInterval})...`);

  const response = await apiRequest('/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, billingInterval }),
  });

  console.log('Checkout URL:', response.url);
  return response;
}

async function createPortalSession() {
  console.log('🔧 Creating billing portal session...');
  const response = await apiRequest('/portal', { method: 'POST' });
  console.log('Portal URL:', response.url);
  return response;
}

async function syncSubscription() {
  console.log('🔄 Syncing subscription...');
  const response = await apiRequest('/sync-subscription', { method: 'POST' });
  console.log('Subscription:', response.subscription);
  return response;
}

// ============================================================================
// Advanced Examples
// ============================================================================

/**
 * Chat with context and caching
 */
async function chatWithContext(userMessage, systemPrompt) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  return createChatCompletion(messages, {
    model: 'claude-sonnet-4',
    usePromptCache: true,
  });
}

/**
 * Monitor credits before expensive operation
 */
async function safeExpensiveOperation(operation) {
  const balance = await getCreditBalance();

  if (balance.credits_remaining_cents < 10000) {
    // $100
    console.warn('⚠️ Low credits! Consider adding more.');
  }

  if (balance.daily_remaining_cents < 1000) {
    // $10
    throw new Error('Insufficient daily credits');
  }

  return operation();
}

/**
 * Batch multiple chat requests
 */
async function batchChat(questions, options = {}) {
  const batchedQuestion = questions.map((q, i) => `Question ${i + 1}: ${q}`).join('\n\n');

  const messages = [{ role: 'user', content: batchedQuestion }];

  return createChatCompletion(messages, options);
}

/**
 * Device linking flow
 */
async function linkDevice(deviceName) {
  const deviceId = crypto.randomUUID();

  // Generate link code
  const linkData = await generateDeviceLinkCode({
    device_id: deviceId,
    device_name: deviceName,
    device_type: 'desktop',
  });

  console.log(`\n📱 Please visit: ${linkData.verify_url}\n`);

  // Poll for authorization
  const authData = await pollDeviceStatus(deviceId);

  return {
    accessToken: authData.access_token,
    refreshToken: authData.refresh_token,
    user: authData.user,
  };
}

// ============================================================================
// Example Usage
// ============================================================================

async function main() {
  try {
    // 1. Get user info
    await getCurrentUser();

    // 2. Check credits
    await getCreditBalance();

    // 3. Simple chat
    const response = await createChatCompletion([
      { role: 'user', content: 'What is the capital of France?' },
    ]);
    console.log('Answer:', response.choices[0].message.content);

    // 4. Streaming chat
    console.log('\nStreaming response:');
    await streamChatCompletion([{ role: 'user', content: 'Write a haiku about coding' }]);

    // 5. Chat with caching
    await chatWithContext(
      'How do I read a CSV file?',
      'You are a helpful coding assistant with expertise in Python.',
    );

    // 6. Safe operation with credit check
    await safeExpensiveOperation(async () => {
      return createChatCompletion([{ role: 'user', content: 'Explain quantum computing' }], {
        maxTokens: 2000,
      });
    });

    // 7. Batch questions
    await batchChat(['What is 2+2?', 'What is the speed of light?', 'Who wrote "1984"?']);

    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// ============================================================================
// Error Handling Helper
// ============================================================================

class APIClient {
  constructor(token, baseUrl = BASE_URL) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError('Rate limit exceeded', parseInt(retryAfter || '60'));
      }

      if (!response.ok) {
        const error = await response.json();
        throw new APIError(error.error?.message, response.status, error.error?.code);
      }

      return response.json();
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof APIError) {
        throw error;
      }
      throw new APIError('Network error', 0, 'NETWORK_ERROR');
    }
  }
}

class APIError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

class RateLimitError extends APIError {
  constructor(message, retryAfter) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// Export for Node.js
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    apiRequest,
    retryWithBackoff,
    getCurrentUser,
    getCreditBalance,
    listModels,
    createChatCompletion,
    streamChatCompletion,
    generateDeviceLinkCode,
    pollDeviceStatus,
    createCheckoutSession,
    createPortalSession,
    syncSubscription,
    chatWithContext,
    safeExpensiveOperation,
    batchChat,
    linkDevice,
    APIClient,
    APIError,
    RateLimitError,
  };
}

// Run main if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

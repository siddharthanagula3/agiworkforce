/**
 * MOCK DATA GENERATORS
 *
 * Generate realistic test data for E2E tests:
 * - Chat messages
 * - LLM responses
 * - Token counts
 * - Cost calculations
 * - Conversation data
 */

// ============================================
// MESSAGE GENERATORS
// ============================================

export function generateUserMessage(template?: string): string {
  const templates = [
    'What is artificial intelligence?',
    'How do neural networks work?',
    'Explain machine learning to me',
    'Write a Python function to calculate fibonacci',
    'Create a React component for authentication',
    'What are the benefits of cloud computing?',
    'Describe the water cycle',
    'How does photosynthesis work?',
    'What is blockchain technology?',
    'Explain quantum computing',
    'Tell me about climate change',
    'What is cryptocurrency?',
    'How do vaccines work?',
    'Describe the solar system',
    'What is the internet of things?',
  ];

  return template || templates[Math.floor(Math.random() * templates.length)];
}

export function generateAssistantResponse(topic?: string): string {
  const responses: Record<string, string> = {
    'artificial intelligence': `Artificial Intelligence (AI) is the simulation of human intelligence processes by computer systems.
    These processes include learning, reasoning, problem-solving, perception, and language understanding.
    AI can be categorized into three types: Narrow AI (ANI), General AI (AGI), and Super AI (ASI).
    Modern AI systems use machine learning and deep learning to process large amounts of data and make predictions.`,

    'neural networks': `Neural networks are computing systems inspired by biological neural networks in animal brains.
    They consist of interconnected nodes (neurons) organized in layers: input, hidden, and output layers.
    Each connection has a weight that is adjusted during training to minimize prediction errors.
    Neural networks are particularly effective for image recognition, natural language processing, and pattern recognition tasks.`,

    'machine learning': `Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience.
    The main types include supervised learning (labeled data), unsupervised learning (unlabeled data), and reinforcement learning (reward-based).
    Popular algorithms include linear regression, decision trees, support vector machines, and neural networks.
    Machine learning powers recommendations, spam detection, fraud detection, and autonomous vehicles.`,

    'python function': `Here's a Python function to calculate Fibonacci numbers:

\`\`\`python
def fibonacci(n):
    if n <= 0:
        return 0
    elif n == 1:
        return 1
    else:
        a, b = 0, 1
        for _ in range(2, n + 1):
            a, b = b, a + b
        return b

# Example usage
print(fibonacci(10))  # Output: 55
\`\`\`

This function uses iteration for efficiency and has O(n) time complexity.`,

    'react component': `Here's a React component for user authentication:

\`\`\`jsx
import React, { useState } from 'react';

export function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      // Handle response
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button disabled={isLoading}>{isLoading ? 'Loading...' : 'Login'}</button>
    </form>
  );
}
\`\`\``,
  };

  const key = topic?.toLowerCase() || Object.keys(responses)[0];
  return responses[key] || responses['artificial intelligence'];
}

// ============================================
// TOKEN GENERATORS
// ============================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function generateTokenUsage(messageLength?: number, responseLength?: number): TokenUsage {
  // Estimate: ~4 characters per token
  const inputTokens = Math.ceil((messageLength || 50) / 4);
  const outputTokens = Math.ceil((responseLength || 200) / 4);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export function calculateEstimatedCost(
  inputTokens: number,
  outputTokens: number,
  model = 'gpt-4',
): number {
  // Pricing per 1M tokens (simplified)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-5.2': { input: 1.25, output: 10.0 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5': { input: 0.0005, output: 0.0015 },
    'claude-opus': { input: 5.0, output: 25.0 },
    'claude-sonnet': { input: 3.0, output: 15.0 },
    'gemini-pro': { input: 0.5, output: 3.0 },
    'deepseek-v3': { input: 0.28, output: 0.42 },
  };

  const modelPricing = pricing[model] || pricing['gpt-4'];
  const inputCost = (inputTokens * modelPricing.input) / 1000000;
  const outputCost = (outputTokens * modelPricing.output) / 1000000;

  return inputCost + outputCost;
}

// ============================================
// CONVERSATION GENERATORS
// ============================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  tokens?: TokenUsage;
  cost?: number;
  model?: string;
  timestamp?: string;
}

export function generateConversationTurn(
  role: 'user' | 'assistant',
  content?: string,
): ConversationTurn {
  return {
    role,
    content: content || (role === 'user' ? generateUserMessage() : generateAssistantResponse()),
    timestamp: new Date().toISOString(),
  };
}

export function generateMultiTurnConversation(turns = 3): ConversationTurn[] {
  const conversation: ConversationTurn[] = [];

  for (let i = 0; i < turns; i++) {
    // User turn
    conversation.push(generateConversationTurn('user'));

    // Assistant turn
    const assistantMessage = generateConversationTurn('assistant');
    assistantMessage.model = Math.random() > 0.5 ? 'gpt-4' : 'claude-opus';
    assistantMessage.tokens = generateTokenUsage(50, 200);
    assistantMessage.cost = calculateEstimatedCost(
      assistantMessage.tokens.inputTokens,
      assistantMessage.tokens.outputTokens,
      assistantMessage.model,
    );

    conversation.push(assistantMessage);
  }

  return conversation;
}

// ============================================
// MODEL & PROVIDER GENERATORS
// ============================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  capabilities: string[];
}

export const MOCK_MODELS: ModelInfo[] = [
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    contextWindow: 128000,
    inputCost: 1.25,
    outputCost: 10.0,
    capabilities: ['chat', 'code', 'vision', 'tools'],
  },
  {
    id: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    inputCost: 5.0,
    outputCost: 25.0,
    capabilities: ['chat', 'code', 'vision', 'thinking'],
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'google',
    contextWindow: 1000000,
    inputCost: 0.5,
    outputCost: 3.0,
    capabilities: ['chat', 'code', 'vision'],
  },
  {
    id: 'deepseek-v3.2',
    name: 'DeepSeek V3.2',
    provider: 'deepseek',
    contextWindow: 64000,
    inputCost: 0.28,
    outputCost: 0.42,
    capabilities: ['chat', 'code', 'reasoning'],
  },
  {
    id: 'qwen3-max',
    name: 'Qwen3 Max',
    provider: 'qwen',
    contextWindow: 128000,
    inputCost: 0.5,
    outputCost: 1.5,
    capabilities: ['chat', 'code', 'thinking'],
  },
];

export function getRandomModel(): ModelInfo {
  return MOCK_MODELS[Math.floor(Math.random() * MOCK_MODELS.length)];
}

export function getModelByName(name: string): ModelInfo | undefined {
  return MOCK_MODELS.find((m) => m.name.toLowerCase().includes(name.toLowerCase()));
}

// ============================================
// ERROR GENERATORS
// ============================================

export interface ErrorMessage {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  recoverable: boolean;
}

export const MOCK_ERRORS: ErrorMessage[] = [
  {
    code: 'TOKEN_LIMIT_EXCEEDED',
    message: 'Token limit exceeded for this conversation. Please start a new one.',
    severity: 'error',
    recoverable: true,
  },
  {
    code: 'INSUFFICIENT_CREDITS',
    message: 'Insufficient credits for this request. Please upgrade your plan.',
    severity: 'error',
    recoverable: false,
  },
  {
    code: 'RATE_LIMIT',
    message: 'Too many requests. Please wait before sending another message.',
    severity: 'warning',
    recoverable: true,
  },
  {
    code: 'NETWORK_ERROR',
    message: 'Network connection lost. Please check your internet connection.',
    severity: 'critical',
    recoverable: true,
  },
  {
    code: 'MODEL_UNAVAILABLE',
    message: 'Selected model is currently unavailable. Using a different model.',
    severity: 'warning',
    recoverable: true,
  },
  {
    code: 'INVALID_REQUEST',
    message: 'Invalid request format. Please check your input and try again.',
    severity: 'error',
    recoverable: true,
  },
];

export function getRandomError(): ErrorMessage {
  return MOCK_ERRORS[Math.floor(Math.random() * MOCK_ERRORS.length)];
}

export function getErrorByCode(code: string): ErrorMessage | undefined {
  return MOCK_ERRORS.find((e) => e.code === code);
}

// ============================================
// BUDGET/CREDIT GENERATORS
// ============================================

export interface BudgetInfo {
  dailyLimit: number;
  dailyUsed: number;
  monthlyLimit: number;
  monthlyUsed: number;
  creditsRemaining: number;
  percentageUsed: number;
}

export function generateBudgetInfo(plan: 'hobby' | 'pro' | 'max' = 'pro'): BudgetInfo {
  const limits: Record<string, number> = {
    hobby: 1.0,
    pro: 12.0,
    max: 150.0,
  };

  const dailyLimit = limits[plan];
  const monthlyLimit = dailyLimit * 30;
  const percentageUsed = Math.random() * 100;
  const dailyUsed = (dailyLimit * percentageUsed) / 100;
  const monthlyUsed = (monthlyLimit * percentageUsed) / 100;
  const creditsRemaining = monthlyLimit - monthlyUsed;

  return {
    dailyLimit,
    dailyUsed,
    monthlyLimit,
    monthlyUsed,
    creditsRemaining,
    percentageUsed,
  };
}

// ============================================
// TOOL/ACTION GENERATORS
// ============================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
}

export const MOCK_TOOLS = [
  { name: 'web_search', description: 'Search the web for information' },
  { name: 'execute_code', description: 'Execute Python code' },
  { name: 'read_file', description: 'Read file contents' },
  { name: 'write_file', description: 'Write to a file' },
  { name: 'run_command', description: 'Run system commands' },
];

export function generateToolCall(toolName?: string): ToolCall {
  const tool =
    MOCK_TOOLS.find((t) => t.name === toolName) ||
    MOCK_TOOLS[Math.floor(Math.random() * MOCK_TOOLS.length)];

  return {
    id: `tool_${Date.now()}_${Math.random()}`,
    name: tool.name,
    arguments: {
      query: 'example query',
      timeout: 30,
    },
    status: 'pending',
  };
}

// ============================================
// AGI GOAL GENERATORS
// ============================================

export interface AGIGoal {
  id: string;
  title: string;
  description: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedSteps: number;
  status: 'created' | 'in_progress' | 'completed' | 'failed';
}

export const GOAL_TEMPLATES = [
  {
    title: 'Build Authentication System',
    description: 'Create a complete user authentication system with JWT',
    complexity: 'complex' as const,
    estimatedSteps: 5,
  },
  {
    title: 'Optimize Database Queries',
    description: 'Analyze and optimize slow database queries',
    complexity: 'medium' as const,
    estimatedSteps: 3,
  },
  {
    title: 'Create Data Visualization',
    description: 'Build interactive charts and graphs',
    complexity: 'medium' as const,
    estimatedSteps: 4,
  },
  {
    title: 'Implement Caching Layer',
    description: 'Add Redis caching to improve performance',
    complexity: 'complex' as const,
    estimatedSteps: 6,
  },
  {
    title: 'Write Unit Tests',
    description: 'Create comprehensive test coverage for existing code',
    complexity: 'simple' as const,
    estimatedSteps: 2,
  },
];

export function generateAGIGoal(template?: (typeof GOAL_TEMPLATES)[0]): AGIGoal {
  const t = template || GOAL_TEMPLATES[Math.floor(Math.random() * GOAL_TEMPLATES.length)];

  return {
    id: `goal_${Date.now()}`,
    title: t.title,
    description: t.description,
    complexity: t.complexity,
    estimatedSteps: t.estimatedSteps,
    status: 'created',
  };
}

// ============================================
// BATCH GENERATORS
// ============================================

export function generateTestDataSet(size = 10) {
  return {
    messages: Array.from({ length: size }, () => generateUserMessage()),
    conversations: Array.from({ length: size }, () => generateMultiTurnConversation(3)),
    models: MOCK_MODELS,
    errors: MOCK_ERRORS,
    budgets: Array.from({ length: 3 }, (_, i) =>
      generateBudgetInfo(['hobby', 'pro', 'max'][i] as any),
    ),
    goals: Array.from({ length: 5 }, () => generateAGIGoal()),
  };
}

// ============================================
// EXPORT UTILITIES
// ============================================

export default {
  generateUserMessage,
  generateAssistantResponse,
  generateTokenUsage,
  calculateEstimatedCost,
  generateConversationTurn,
  generateMultiTurnConversation,
  getRandomModel,
  getRandomError,
  generateBudgetInfo,
  generateToolCall,
  generateAGIGoal,
  generateTestDataSet,
  MOCK_MODELS,
  MOCK_ERRORS,
  GOAL_TEMPLATES,
};

import { getModelMetadata } from '../constants/llm';

export interface TokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export function estimateTokens(text: string, isCode = false): number {
  if (!text) return 0;

  const charsPerToken = isCode ? 3 : 4;
  return Math.ceil(text.length / charsPerToken);
}

export function estimateInputTokens(
  message: string,
  systemPrompt?: string,
  contextItems?: Array<{ content?: string; type?: string }>,
): number {
  let total = 0;

  if (systemPrompt) {
    total += estimateTokens(systemPrompt, false);
  }

  total += estimateTokens(message, false);

  if (contextItems) {
    for (const item of contextItems) {
      if (item.content) {
        const isCode = item.type === 'file' || item.type === 'code-snippet';
        total += estimateTokens(item.content, isCode);
      }
    }
  }

  total += 20;

  return total;
}

export function estimateOutputTokens(response: string, includesCode = false): number {
  if (!response) return 0;

  const codeBlockMatches = response.match(/```[\s\S]*?```/g);
  if (codeBlockMatches || includesCode) {
    const codeContent = codeBlockMatches?.join('') || '';
    const textContent = response.replace(/```[\s\S]*?```/g, '');
    return estimateTokens(codeContent, true) + estimateTokens(textContent, false);
  }

  return estimateTokens(response, false);
}

export function calculateInputCost(inputTokens: number, modelId: string): number {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return 0;
  return (inputTokens / 1_000_000) * metadata.inputCost;
}

export function calculateOutputCost(outputTokens: number, modelId: string): number {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return 0;
  return (outputTokens / 1_000_000) * metadata.outputCost;
}

export function calculateTokenBreakdown(
  inputTokens: number,
  outputTokens: number,
  modelId: string,
): TokenBreakdown {
  const inputCost = calculateInputCost(inputTokens, modelId);
  const outputCost = calculateOutputCost(outputTokens, modelId);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

export function formatTokens(count: number): string {
  if (count < 1000) {
    return `${count}`;
  }

  if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  }

  return `${(count / 1000000).toFixed(1)}M`;
}

export function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  if (cost < 0.0001) return '<$0.0001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokenBreakdown(breakdown: TokenBreakdown): {
  input: string;
  output: string;
  total: string;
  inputCost: string;
  outputCost: string;
  totalCost: string;
} {
  return {
    input: formatTokens(breakdown.inputTokens),
    output: formatTokens(breakdown.outputTokens),
    total: formatTokens(breakdown.totalTokens),
    inputCost: formatCost(breakdown.inputCost),
    outputCost: formatCost(breakdown.outputCost),
    totalCost: formatCost(breakdown.totalCost),
  };
}

export function estimateContextItemTokens(item: {
  type: string;
  content?: string;
  excerpt?: string;
  description?: string;
}): number {
  let total = 0;

  total += 10;

  if (item.content) {
    const isCode = item.type === 'file' || item.type === 'code-snippet';
    total += estimateTokens(item.content, isCode);
  }

  if (item.excerpt && !item.content) {
    total += estimateTokens(item.excerpt, true);
  }

  if (item.description) {
    total += estimateTokens(item.description, false);
  }

  return total;
}

export function getContextUtilization(
  currentTokens: number,
  modelId: string,
): { percentage: number; remaining: number; maxTokens: number } {
  const metadata = getModelMetadata(modelId);
  const maxTokens = metadata?.contextWindow || 4096;
  const percentage = (currentTokens / maxTokens) * 100;
  const remaining = Math.max(0, maxTokens - currentTokens);

  return { percentage, remaining, maxTokens };
}

export function isWithinContextLimit(
  currentTokens: number,
  modelId: string,
  reserveRatio = 0.1,
): boolean {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return true;

  const reservedTokens = metadata.contextWindow * reserveRatio;
  return currentTokens < metadata.contextWindow - reservedTokens;
}

export function estimateConversationTokens(messages: Array<{ role: string; content: string }>): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const message of messages) {
    const tokens = estimateTokens(message.content, false);
    if (message.role === 'user' || message.role === 'system') {
      inputTokens += tokens;
    } else {
      outputTokens += tokens;
    }

    inputTokens += 4;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

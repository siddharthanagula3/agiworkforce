import { getProviderOffering } from '@agiworkforce/types';
import { QWEN_DEFAULT_BASE_URL } from './base-url';

export interface QwenQuotaProbePolicy {
  maxOutputTokens: number;
  imageSize: string;
  videoSize: string;
  videoSeconds: number;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  maxPolls: number;
}

export interface QwenQuotaProbeResult {
  status: 'succeeded' | 'submitted' | 'failed' | 'quota_exhausted';
  elapsedMs: number;
  taskId?: string;
  text?: string;
  artifactUrl?: string;
  usage?: unknown;
  providerCode?: string;
}

export interface QwenQuotaInput {
  messages: {
    role: 'system' | 'user' | 'assistant';
    content:
      | string
      | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];
  }[];
  signal?: AbortSignal;
}

export async function streamQwenQuotaChat(
  offeringKey: string,
  apiKey: string,
  policy: QwenQuotaProbePolicy,
  input: QwenQuotaInput,
  transport: (url: string, options: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  const offering = getProviderOffering(offeringKey);
  if (!offering?.providerModelId || offering.quotaProbeProtocol !== 'chat') {
    throw new Error('This model does not support free-quota chat.');
  }
  if (
    !offering.quotaChatImageInput &&
    input.messages.some(
      (message) =>
        Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'),
    )
  ) {
    throw new Error('This free-quota model does not accept image input.');
  }
  return transport(`${QWEN_DEFAULT_BASE_URL}/chat/completions`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.any([
      AbortSignal.timeout(policy.requestTimeoutMs),
      ...(input.signal ? [input.signal] : []),
    ]),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: offering.providerModelId,
      messages: input.messages,
      max_tokens: policy.maxOutputTokens,
      enable_thinking: offering.quotaThinkingRequired ?? false,
      ...(offering.quotaThinkingRequired ? { thinking_budget: policy.maxOutputTokens } : {}),
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
}

type ProbeResponse = {
  code?: string;
  error?: { code?: string };
  choices?: { message?: { content?: string } }[];
  usage?: unknown;
  output?: {
    task_id?: string;
    task_status?: string;
    code?: string;
    video_url?: string;
    choices?: { message?: { content?: { image?: string }[] } }[];
  };
};

export async function runQwenQuotaProbe(
  offeringKey: string,
  apiKey: string,
  policy: QwenQuotaProbePolicy,
  transport: (url: string, options: RequestInit) => Promise<Response> = fetch,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  input?: QwenQuotaInput,
): Promise<QwenQuotaProbeResult> {
  const offering = getProviderOffering(offeringKey);
  if (!offering?.providerModelId || offering.provider !== 'qwen' || !offering.quotaProbeProtocol) {
    throw new Error('This offering has no verified quota experiment protocol.');
  }
  const protocol = offering.quotaProbeProtocol;
  const started = Date.now();
  const nativeBase = new URL('/api/v1/', QWEN_DEFAULT_BASE_URL);
  const request = async (url: URL, body?: unknown): Promise<ProbeResponse> => {
    const response = await transport(url.toString(), {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.any([
        AbortSignal.timeout(policy.requestTimeoutMs),
        ...(input?.signal ? [input.signal] : []),
      ]),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(body && protocol === 'video-async' ? { 'X-DashScope-Async': 'enable' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await response.json()) as ProbeResponse;
    if (!response.ok)
      return { code: data.code ?? data.error?.code ?? `provider_http_${response.status}` };
    return data;
  };
  const model = offering.providerModelId;
  let data: ProbeResponse;
  if (protocol === 'chat') {
    if (offering.quotaThinkingRequired)
      throw new Error('Use the composer streaming route for this reasoning model.');
    data = await request(new URL(`${QWEN_DEFAULT_BASE_URL}/chat/completions`), {
      model,
      messages: input?.messages ?? [
        {
          role: 'user',
          content:
            'Reply with the sum of 17 and 25, followed by a short sentence about a paper boat.',
        },
      ],
      max_tokens: policy.maxOutputTokens,
      enable_thinking: false,
      stream: false,
    });
  } else if (protocol === 'image-sync') {
    data = await request(new URL('services/aigc/multimodal-generation/generation', nativeBase), {
      model,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                text:
                  input?.messages.findLast((message) => message.role === 'user')?.content ??
                  'A single blue paper boat on a plain white background, simple studio photograph.',
              },
            ],
          },
        ],
      },
      parameters: { prompt_extend: false, size: offering.quotaImageSize ?? policy.imageSize, n: 1 },
    });
  } else {
    data = await request(new URL('services/aigc/video-generation/video-synthesis', nativeBase), {
      model,
      input: {
        prompt:
          input?.messages.findLast((message) => message.role === 'user')?.content ??
          'A blue paper boat gently moving across still water. Static camera, single shot.',
      },
      parameters: {
        size: policy.videoSize,
        duration: policy.videoSeconds,
        prompt_extend: false,
        shot_type: 'single',
      },
    });
  }
  const taskId = data.output?.task_id;
  if (taskId) {
    for (
      let poll = 0;
      poll < policy.maxPolls && ['PENDING', 'RUNNING'].includes(data.output?.task_status ?? '');
      poll++
    ) {
      await wait(policy.pollIntervalMs);
      try {
        data = await request(new URL(`tasks/${encodeURIComponent(taskId)}`, nativeBase));
      } catch {
        return {
          status: 'submitted',
          elapsedMs: Date.now() - started,
          taskId,
          providerCode: 'poll_interrupted',
        };
      }
    }
  }
  const code = data.code ?? data.error?.code ?? data.output?.code;
  const text = data.choices?.[0]?.message?.content;
  const artifactUrl =
    data.output?.video_url ??
    data.output?.choices?.[0]?.message?.content?.find((part) => part.image)?.image;
  const pending = taskId && ['PENDING', 'RUNNING'].includes(data.output?.task_status ?? '');
  return {
    status:
      code === 'AllocationQuota.FreeTierOnly'
        ? 'quota_exhausted'
        : code
          ? 'failed'
          : pending
            ? 'submitted'
            : text || artifactUrl
              ? 'succeeded'
              : 'failed',
    elapsedMs: Date.now() - started,
    ...(taskId ? { taskId } : {}),
    ...(text ? { text } : {}),
    ...(artifactUrl ? { artifactUrl } : {}),
    ...(data.usage ? { usage: data.usage } : {}),
    ...(code ? { providerCode: code } : {}),
  };
}

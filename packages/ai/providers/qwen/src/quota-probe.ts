import {
  getProviderOffering,
  getProviderOfferingQuotaUnit,
  type ProviderOffering,
  type ProviderOfferingQuotaProtocol,
} from '@agiworkforce/types';
import { QWEN_DEFAULT_BASE_URL } from './base-url';

export interface QwenQuotaProbePolicy {
  maxOutputTokens: number;
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
  consumedSeconds?: number;
  clipSecondsExceeded?: true;
  providerCode?: string;
  providerMessage?: string;
  providerStatus?: number;
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

type ProbeOutput = {
  task_id?: string;
  task_status?: string;
  code?: string;
  message?: string;
  video_url?: string;
  choices?: { message?: { content?: { image?: string }[] } }[];
  results?: { url?: string; code?: string; message?: string }[];
};

type ProbeResponse = {
  httpStatus?: number;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
  choices?: { message?: { content?: string } }[];
  usage?: unknown;
  output?: ProbeOutput;
};

type QuotaMediaProtocol = Exclude<ProviderOfferingQuotaProtocol, 'chat'>;

interface QuotaMediaRequest {
  model: string;
  prompt: string;
  offering: ProviderOffering;
}

interface QuotaMediaOutcome {
  artifactUrl?: string | undefined;
  code?: string | undefined;
  message?: string | undefined;
}

interface ReportedVideoUsage {
  duration?: unknown;
  video_duration?: unknown;
  output_video_duration?: unknown;
}

interface QuotaMediaShape {
  path: string;
  asynchronous: boolean;
  defaultPrompt: string;
  body: (request: QuotaMediaRequest) => unknown;
  outcome: (output: ProbeOutput | undefined) => QuotaMediaOutcome;
}

const DEFAULT_IMAGE_PROMPT =
  'A single blue paper boat on a plain white background, simple studio photograph.';
const DEFAULT_VIDEO_PROMPT =
  'A blue paper boat gently moving across still water. Static camera, single shot.';
const INCOMPLETE_OFFERING = 'This offering has an incomplete request in the catalogue.';
const UNFINISHED_TASK_STATUSES = ['PENDING', 'RUNNING'];

function promptExtension(offering: ProviderOffering): { prompt_extend?: false } {
  return offering.quotaPromptExtendUnsupported ? {} : { prompt_extend: false };
}

function imageSize(offering: ProviderOffering): string {
  if (!offering.quotaImageSize) throw new Error(INCOMPLETE_OFFERING);
  return offering.quotaImageSize;
}

function videoFrame(offering: ProviderOffering): Record<string, string> {
  if (offering.quotaVideoSize) return { size: offering.quotaVideoSize };
  if (offering.quotaVideoResolution && offering.quotaVideoRatio) {
    return { resolution: offering.quotaVideoResolution, ratio: offering.quotaVideoRatio };
  }
  throw new Error(INCOMPLETE_OFFERING);
}

function videoDuration(offering: ProviderOffering): { duration?: number } {
  if (!offering.quotaVideoSeconds) throw new Error(INCOMPLETE_OFFERING);
  return offering.quotaVideoDurationFixed ? {} : { duration: offering.quotaVideoSeconds };
}

const QUOTA_MEDIA_SHAPES: Record<QuotaMediaProtocol, QuotaMediaShape> = {
  'image-sync': {
    path: 'services/aigc/multimodal-generation/generation',
    asynchronous: false,
    defaultPrompt: DEFAULT_IMAGE_PROMPT,
    body: ({ model, prompt, offering }) => ({
      model,
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { ...promptExtension(offering), size: imageSize(offering), n: 1 },
    }),
    outcome: (output) => ({
      artifactUrl: output?.choices?.[0]?.message?.content?.find((part) => part.image)?.image,
    }),
  },
  'image-async': {
    path: 'services/aigc/text2image/image-synthesis',
    asynchronous: true,
    defaultPrompt: DEFAULT_IMAGE_PROMPT,
    body: ({ model, prompt, offering }) => ({
      model,
      input: { prompt },
      parameters: { size: imageSize(offering), n: 1, ...promptExtension(offering) },
    }),
    outcome: (output) => {
      const generated = output?.results?.find((entry) => entry.url);
      if (generated) return { artifactUrl: generated.url };
      const refused = output?.results?.find((entry) => entry.code);
      return { code: refused?.code, message: refused?.message };
    },
  },
  'video-async': {
    path: 'services/aigc/video-generation/video-synthesis',
    asynchronous: true,
    defaultPrompt: DEFAULT_VIDEO_PROMPT,
    body: ({ model, prompt, offering }) => ({
      model,
      input: { prompt },
      parameters: {
        ...videoFrame(offering),
        ...videoDuration(offering),
        ...promptExtension(offering),
        ...(offering.quotaVideoShotType ? { shot_type: offering.quotaVideoShotType } : {}),
        ...(offering.quotaVideoWatermark === undefined
          ? {}
          : { watermark: offering.quotaVideoWatermark }),
      },
    }),
    outcome: (output) => ({ artifactUrl: output?.video_url }),
  },
};

function taskIsUnfinished(response: ProbeResponse): boolean {
  return UNFINISHED_TASK_STATUSES.includes(response.output?.task_status ?? '');
}

function latestUserText(input: QwenQuotaInput | undefined): string | undefined {
  const content = input?.messages.findLast((message) => message.role === 'user')?.content;
  if (content === undefined || typeof content === 'string') return content;
  return content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

function shortenPrompt(prompt: string, maxChars: number | undefined): string {
  if (maxChars === undefined || prompt.length <= maxChars) return prompt;
  const shortened = prompt.slice(0, maxChars);
  return /[\uD800-\uDBFF]$/.test(shortened) ? shortened.slice(0, -1) : shortened;
}

function reportedVideoSeconds(usage: unknown): number | undefined {
  if (typeof usage !== 'object' || usage === null) return undefined;
  const reported = usage as ReportedVideoUsage;
  return [reported.duration, reported.video_duration, reported.output_video_duration].find(
    (seconds): seconds is number =>
      typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0,
  );
}

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
  const shape = protocol === 'chat' ? null : QUOTA_MEDIA_SHAPES[protocol];
  const started = Date.now();
  const nativeBase = new URL('/api/v1/', QWEN_DEFAULT_BASE_URL);
  // The caller's own time limit is sized from this sum, so no wait or request may run past it.
  const deadline = started + policy.requestTimeoutMs + policy.maxPolls * policy.pollIntervalMs;
  const request = async (url: URL, body?: unknown): Promise<ProbeResponse> => {
    const response = await transport(url.toString(), {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.any([
        AbortSignal.timeout(Math.max(1, Math.min(policy.requestTimeoutMs, deadline - Date.now()))),
        ...(input?.signal ? [input.signal] : []),
      ]),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(body && shape?.asynchronous ? { 'X-DashScope-Async': 'enable' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await response.json()) as ProbeResponse;
    if (!response.ok) {
      const message = data.message ?? data.error?.message;
      return {
        httpStatus: response.status,
        code: data.code ?? data.error?.code ?? `provider_http_${response.status}`,
        ...(message ? { message } : {}),
      };
    }
    return data;
  };
  const model = offering.providerModelId;
  let data: ProbeResponse;
  if (shape === null) {
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
  } else {
    data = await request(
      new URL(shape.path, nativeBase),
      shape.body({
        model,
        prompt: shortenPrompt(
          latestUserText(input) ?? shape.defaultPrompt,
          offering.quotaPromptMaxChars,
        ),
        offering,
      }),
    );
  }
  const taskId = data.output?.task_id;
  let pollWithoutTaskState: ProbeResponse | undefined;
  if (taskId) {
    for (
      let poll = 0;
      poll < policy.maxPolls &&
      Date.now() + policy.pollIntervalMs < deadline &&
      taskIsUnfinished(data);
      poll++
    ) {
      await wait(policy.pollIntervalMs);
      let answer: ProbeResponse;
      try {
        answer = await request(new URL(`tasks/${encodeURIComponent(taskId)}`, nativeBase));
      } catch {
        return {
          status: 'submitted',
          elapsedMs: Date.now() - started,
          taskId,
          providerCode: 'poll_interrupted',
        };
      }
      if (answer.output?.task_status) {
        data = answer;
        pollWithoutTaskState = undefined;
      } else {
        pollWithoutTaskState = answer;
      }
    }
  }
  const outcome: QuotaMediaOutcome = shape?.outcome(data.output) ?? {};
  const answered = pollWithoutTaskState ?? data;
  const code = answered.code ?? answered.error?.code ?? answered.output?.code ?? outcome.code;
  const providerMessage =
    answered.message ?? answered.error?.message ?? answered.output?.message ?? outcome.message;
  const text = data.choices?.[0]?.message?.content;
  const artifactUrl = outcome.artifactUrl;
  const pending = Boolean(taskId) && taskIsUnfinished(data);
  const status = pending
    ? 'submitted'
    : code === 'AllocationQuota.FreeTierOnly'
      ? 'quota_exhausted'
      : code
        ? 'failed'
        : text || artifactUrl
          ? 'succeeded'
          : 'failed';
  const consumedSeconds =
    status === 'succeeded' && getProviderOfferingQuotaUnit(offering) === 'seconds'
      ? reportedVideoSeconds(data.usage)
      : undefined;
  return {
    status,
    elapsedMs: Date.now() - started,
    ...(taskId ? { taskId } : {}),
    ...(text ? { text } : {}),
    ...(artifactUrl ? { artifactUrl } : {}),
    ...(data.usage ? { usage: data.usage } : {}),
    ...(consumedSeconds === undefined ? {} : { consumedSeconds }),
    ...(consumedSeconds !== undefined &&
    offering.quotaVideoSeconds !== undefined &&
    consumedSeconds > offering.quotaVideoSeconds
      ? { clipSecondsExceeded: true as const }
      : {}),
    ...(code ? { providerCode: code } : {}),
    ...(code && providerMessage ? { providerMessage } : {}),
    ...(code && answered.httpStatus ? { providerStatus: answered.httpStatus } : {}),
  };
}

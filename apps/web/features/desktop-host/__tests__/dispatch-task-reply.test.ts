import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DispatchTaskStepReply } from '@agiworkforce/types';
import type { Message } from '@shared/stores/web-chat-store';

const reportDispatchTask = vi.fn(async () => ({ accepted: true }));

vi.mock('../lib/runtime-client', () => ({
  reportDispatchTask,
  setDispatchTaskRunnerReady: vi.fn(async () => undefined),
}));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn(async (headers: object) => headers) }));
vi.mock('@/lib/identity/client', () => ({
  useCurrentUser: () => ({ isLoaded: true, isSignedIn: true }),
}));

const { answerReplies, replyFieldIssue } = await import('../hooks/use-dispatch-task-runner');

const FORM = {
  form: {
    method: 'elicitation/create',
    params: {
      mode: 'form',
      message: 'Where should the invite go?',
      requestedSchema: {
        type: 'object',
        properties: {
          email: { type: 'string', title: 'Email', format: 'email', maxLength: 40 },
          when: { type: 'string', title: 'When', format: 'date-time' },
          room: { type: 'string', title: 'Room', enum: ['north', 'south'] },
        },
        required: ['email', 'room'],
      },
    },
  },
};

function answerWith(tools: NonNullable<Message['metadata']>['tools']): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    metadata: { tools },
  } as unknown as Message;
}

function runWith() {
  return {
    requestId: 'task-1',
    conversationId: null,
    runtime: {
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      resolveToolApproval: vi.fn(async () => undefined),
      resolveToolInput: vi.fn(async () => true),
    },
    settled: false,
    cancelRequested: false,
    lastReport: null,
    unsubscribe: () => undefined,
  };
}

const inputTool = {
  toolCallId: 'call-input',
  name: 'calendar_invite',
  status: 'awaiting_input' as const,
  inputRequests: FORM,
};
const approvalTool = {
  toolCallId: 'call-approval',
  name: 'send_email',
  status: 'awaiting_approval' as const,
};

describe('answering a dispatched task from the phone', () => {
  beforeEach(() => {
    reportDispatchTask.mockClear();
  });

  it('refuses a choice the prompt did not offer', async () => {
    const run = runWith();
    const reply: DispatchTaskStepReply = {
      toolCallId: 'call-input',
      kind: 'input',
      inputKey: 'form',
      values: { email: 'ada@example.com', room: 'attic' },
    };
    await answerReplies(run as never, answerWith([inputTool]), [reply]);
    expect(run.runtime.resolveToolInput).not.toHaveBeenCalled();
    expect(reportDispatchTask).toHaveBeenCalledWith(
      expect.objectContaining({
        replyError: {
          toolCallId: 'call-input',
          message: expect.any(String),
          fieldId: 'room',
          code: 'not_an_option',
        },
      }),
    );
  });

  it('never relays the offending value or any free text about it', async () => {
    const run = runWith();
    await answerReplies(run as never, answerWith([inputTool]), [
      {
        toolCallId: 'call-input',
        kind: 'input',
        inputKey: 'form',
        values: { email: 'ada@example.com', room: '<script>attic</script>' },
      },
    ]);
    const report = JSON.stringify(reportDispatchTask.mock.calls.at(-1));
    expect(report).not.toContain('attic');
    expect(report).not.toContain('Room');
  });

  it('tells the phone a question is no longer waiting when its step has gone', async () => {
    const run = runWith();
    await answerReplies(run as never, answerWith([approvalTool]), [
      {
        toolCallId: 'call-input',
        kind: 'input',
        inputKey: 'form',
        values: { email: 'ada@example.com', room: 'north' },
      },
    ]);
    expect(reportDispatchTask).toHaveBeenCalledWith(
      expect.objectContaining({
        replyError: expect.objectContaining({ toolCallId: 'call-input', code: 'expired' }),
      }),
    );
  });

  it('refuses a missing required field, a bad format and an overlong value', () => {
    const prompt = {
      key: 'form',
      mode: 'form' as const,
      message: 'Where should the invite go?',
      fields: [
        {
          key: 'email',
          title: 'Email',
          kind: 'text' as const,
          required: true,
          format: 'email' as const,
          maxLength: 10,
        },
        {
          key: 'room',
          title: 'Room',
          kind: 'choice' as const,
          required: true,
          options: [{ value: 'north', label: 'North' }],
        },
      ],
    };
    expect(replyFieldIssue(prompt, { room: 'north' })).toEqual({
      fieldId: 'email',
      code: 'required',
    });
    expect(replyFieldIssue(prompt, { email: 'nope', room: 'north' })).toEqual({
      fieldId: 'email',
      code: 'bad_format',
    });
    expect(replyFieldIssue(prompt, { email: 'a@verylongdomain.example', room: 'north' })).toEqual({
      fieldId: 'email',
      code: 'too_long',
    });
    expect(replyFieldIssue(prompt, { email: 'a@b.co', room: 'north' })).toBeNull();
  });

  it('refuses an invalid date and time without throwing', async () => {
    const run = runWith();
    await answerReplies(run as never, answerWith([inputTool]), [
      {
        toolCallId: 'call-input',
        kind: 'input',
        inputKey: 'form',
        values: { email: 'ada@example.com', room: 'north', when: 'tomorrow-ish' },
      },
    ]);
    expect(run.runtime.resolveToolInput).not.toHaveBeenCalled();
    expect(reportDispatchTask).toHaveBeenCalled();
  });

  it('still answers the other steps when one fails', async () => {
    const run = runWith();
    run.runtime.resolveToolInput.mockRejectedValueOnce(new Error('boom'));
    await answerReplies(run as never, answerWith([inputTool, approvalTool]), [
      {
        toolCallId: 'call-input',
        kind: 'input',
        inputKey: 'form',
        values: { email: 'ada@example.com', room: 'north' },
      },
      { toolCallId: 'call-approval', kind: 'approval', approved: true },
    ]);
    expect(run.runtime.resolveToolInput).toHaveBeenCalledTimes(1);
    expect(run.runtime.resolveToolApproval).toHaveBeenCalledWith(
      'assistant-1',
      'call-approval',
      'approved',
    );
    expect(reportDispatchTask).toHaveBeenCalledWith(
      expect.objectContaining({
        replyError: expect.objectContaining({ toolCallId: 'call-input' }),
      }),
    );
  });

  it('passes a valid answer through the chat stream resolver', async () => {
    const run = runWith();
    await answerReplies(run as never, answerWith([inputTool]), [
      {
        toolCallId: 'call-input',
        kind: 'input',
        inputKey: 'form',
        values: { email: 'ada@example.com', room: 'south' },
      },
    ]);
    expect(run.runtime.resolveToolInput).toHaveBeenCalledWith('assistant-1', 'call-input', {
      form: { action: 'accept', content: { email: 'ada@example.com', room: 'south' } },
    });
  });
});

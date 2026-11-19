import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ChatCompletionRequestSchema } from './request-processor';

/**
 * The chat system prompt version is global: moving the pin changes the system
 * text of conversations already under way on their next turn. Anthropic warns
 * that a stored conversation resumed with a changed system prompt can be
 * rejected when signed thinking blocks are sent back. That cannot happen here
 * for the two reasons below; if either stops holding, the version has to be
 * kept per conversation before the pin moves again.
 */

const COMPLETIONS_DIR = path.resolve(import.meta.dirname, '..');

const CHECKPOINT_RESUME_ROUTES = [
  'approve/route.ts',
  'resume-input/route.ts',
  'runs/[runId]/resume/route.ts',
  'lib/tool-result-resume.ts',
];

const TOOL_RESULT_RESUME_ROUTES = ['resume-device/route.ts', 'resume-caller/route.ts'];

const RESTORE_CALL = 'restoreCheckpointedTurn(processed, claim.checkpoint);';

describe('moving the chat system prompt pin under existing conversations', () => {
  it('never takes a signed thinking block from the client history of a later turn', () => {
    const parsed = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'earlier reasoning', signature: 'sig-from-turn-one' },
            { type: 'text', text: 'Hello' },
          ],
        },
        { role: 'user', content: 'And now?' },
      ],
    });

    const parts = parsed.messages[1]?.content;
    expect(Array.isArray(parts)).toBe(true);
    for (const part of parts as Record<string, unknown>[]) {
      expect(part).not.toHaveProperty('signature');
      expect(part).not.toHaveProperty('thinking');
    }
  });

  it.each(CHECKPOINT_RESUME_ROUTES)(
    '%s resumes a paused turn from the messages its checkpoint stored, system text included',
    (route) => {
      const source = readFileSync(path.join(COMPLETIONS_DIR, route), 'utf8');
      const processedAt = source.indexOf('const processed');
      const restoredAt = source.indexOf(RESTORE_CALL);

      expect(processedAt).toBeGreaterThan(-1);
      expect(restoredAt).toBeGreaterThan(processedAt);
    },
  );

  it.each(TOOL_RESULT_RESUME_ROUTES)(
    '%s resumes its claimed checkpoint through the shared tool-result resume',
    (route) => {
      const source = readFileSync(path.join(COMPLETIONS_DIR, route), 'utf8');

      expect(source).toContain("from '@/app/api/llm/v1/chat/completions/lib/tool-result-resume';");
      expect(source).toMatch(/return continueToolResultResume\(\{[^}]*\bclaim,/);
      expect(source).not.toContain('processRequest(');
    },
  );

  it('restores the stored messages, retargeting only when the checkpoint names the model it ran on', () => {
    const source = readFileSync(
      path.join(COMPLETIONS_DIR, 'lib/approval-checkpoint-request.ts'),
      'utf8',
    );

    expect(source).toContain('processed.llmRequest.messages = checkpoint.messages;');
    expect(source).toContain('retargetMessagesToModel(\n    checkpoint.messages,');
  });
});

import { describe, expect, it } from 'vitest';
import {
  DISPATCH_TASK_REPLY_LIMITS,
  parseDispatchTaskPendingSteps,
  parseDispatchTaskReplies,
} from '../cross-device';

const textField = {
  key: 'note',
  title: 'Note',
  kind: 'text',
  required: true,
  format: 'uri',
  minLength: 1,
  maxLength: 100,
};
const choiceField = {
  key: 'target',
  title: 'Target',
  kind: 'choice',
  required: false,
  options: [{ value: 'draft', label: 'Draft' }],
};
const input = {
  toolCallId: 'call-1',
  kind: 'input',
  inputKey: 'form-1',
  message: 'Choose the target',
  fields: [textField, choiceField],
};

describe('pending companion input', () => {
  it('keeps approval and input steps with their validation constraints', () => {
    const approval = { toolCallId: 'call-2', kind: 'approval', summary: 'Publish draft' };
    expect(parseDispatchTaskPendingSteps([input, approval])).toEqual([input, approval]);
    expect(
      parseDispatchTaskPendingSteps([
        {
          ...input,
          fields: [{ key: 'optional', title: 'Optional', kind: 'text', required: false }],
        },
      ]),
    ).toEqual([
      { ...input, fields: [{ key: 'optional', title: 'Optional', kind: 'text', required: false }] },
    ]);
  });

  it.each(
    [
      null,
      {},
      [null],
      [{ ...input, toolCallId: ' ' }],
      [{ ...input, kind: 'execute' }],
      [{ ...input, fields: [] }],
      [{ ...input, inputKey: null }],
      [{ ...input, fields: [{ ...textField, required: 'true' }] }],
      [{ ...input, fields: [{ ...textField, kind: 'script' }] }],
      [{ ...input, fields: [{ ...textField, format: 'javascript' }] }],
      [{ ...input, fields: [{ ...textField, minLength: -1 }] }],
      [
        {
          ...input,
          fields: [{ ...textField, maxLength: DISPATCH_TASK_REPLY_LIMITS.valueLength + 1 }],
        },
      ],
      [{ ...input, fields: [{ ...choiceField, options: [] }] }],
      [{ ...input, fields: [{ ...choiceField, options: [null] }] }],
      [{ ...input, fields: [{ ...choiceField, options: [{ value: '', label: 'Draft' }] }] }],
      [{ toolCallId: 'call-1', kind: 'approval', summary: '' }],
      Array(DISPATCH_TASK_REPLY_LIMITS.steps + 1).fill(input),
    ].map((value) => [value]),
  )('refuses the whole malformed pending-step list %#', (value) => {
    expect(parseDispatchTaskPendingSteps(value)).toBeNull();
  });
});

describe('companion replies', () => {
  it('preserves an explicit denial and valid user input without executing a permission decision', () => {
    const replies = [
      { toolCallId: 'call-1', kind: 'approval', approved: false },
      {
        toolCallId: 'call-2',
        kind: 'input',
        inputKey: 'form-1',
        values: { note: '', target: 'draft' },
      },
    ];
    expect(parseDispatchTaskReplies(replies)).toEqual(replies);
  });

  it.each(
    [
      [],
      null,
      [null],
      [{ toolCallId: ' ', kind: 'approval', approved: true }],
      [{ toolCallId: 'call-1', kind: 'approval', approved: 'true' }],
      [{ toolCallId: 'call-1', kind: 'input', inputKey: '', values: {} }],
      [{ toolCallId: 'call-1', kind: 'input', inputKey: 'form-1', values: [] }],
      [{ toolCallId: 'call-1', kind: 'input', inputKey: 'form-1', values: { note: 1 } }],
      [
        {
          toolCallId: 'call-1',
          kind: 'input',
          inputKey: 'form-1',
          values: { note: 'x'.repeat(DISPATCH_TASK_REPLY_LIMITS.valueLength + 1) },
        },
      ],
      [
        {
          toolCallId: 'call-1',
          kind: 'input',
          inputKey: 'form-1',
          values: { ['x'.repeat(DISPATCH_TASK_REPLY_LIMITS.idLength + 1)]: 'value' },
        },
      ],
      [
        {
          toolCallId: 'call-1',
          kind: 'input',
          inputKey: 'form-1',
          values: Object.fromEntries(
            Array.from({ length: DISPATCH_TASK_REPLY_LIMITS.fields + 1 }, (_, index) => [
              `field${index}`,
              'value',
            ]),
          ),
        },
      ],
      [{ toolCallId: 'call-1', kind: 'unrecognized', approved: true }],
    ].map((value) => [value]),
  )('refuses a malformed reply instead of converting it to approval %#', (value) => {
    expect(parseDispatchTaskReplies(value)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { parseDispatchTaskReplyError } from '../cross-device';

describe('parseDispatchTaskReplyError', () => {
  it('keeps a known code and field id beside the message', () => {
    expect(
      parseDispatchTaskReplyError({
        toolCallId: 'call-1',
        message: 'generic',
        fieldId: 'room',
        code: 'not_an_option',
      }),
    ).toEqual({ toolCallId: 'call-1', message: 'generic', fieldId: 'room', code: 'not_an_option' });
  });

  it('drops a code outside the closed set', () => {
    expect(
      parseDispatchTaskReplyError({ toolCallId: 'call-1', message: 'generic', code: 'whatever' }),
    ).toEqual({ toolCallId: 'call-1', message: 'generic' });
  });

  it('still reads an older report that carries only a message', () => {
    expect(parseDispatchTaskReplyError({ toolCallId: 'call-1', message: 'generic' })).toEqual({
      toolCallId: 'call-1',
      message: 'generic',
    });
    expect(parseDispatchTaskReplyError({ message: 'generic' })).toBeNull();
  });
});

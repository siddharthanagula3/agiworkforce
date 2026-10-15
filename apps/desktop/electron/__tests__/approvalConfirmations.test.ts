import { beforeEach, describe, expect, it } from 'vitest';
import {
  approvalWasDeclined,
  beginApprovalConfirmation,
  endApprovalConfirmation,
  noteApprovalDeclined,
  noteApprovalSessionEvent,
  resetApprovalConfirmations,
} from '../runtime/approvalConfirmations';

const approval = { rootId: 'root-1', threadId: 'thread-1', requestId: 'ask-1' };
const other = { ...approval, requestId: 'ask-2' };

beforeEach(() => {
  resetApprovalConfirmations();
});

describe('the one dialog an approval may have open', () => {
  it('is claimed once, whoever asks, until it is closed', () => {
    expect(beginApprovalConfirmation(approval)).toBe(true);
    expect(beginApprovalConfirmation({ ...approval })).toBe(false);
    expect(beginApprovalConfirmation(other)).toBe(true);

    endApprovalConfirmation(approval);

    expect(beginApprovalConfirmation(approval)).toBe(true);
  });
});

describe('a Cancel chosen at this computer', () => {
  it('stays for the requester it answered, and not for the other', () => {
    noteApprovalDeclined(approval, 'phone');

    expect(approvalWasDeclined(approval, 'phone')).toBe(true);
    expect(approvalWasDeclined(approval, 'page')).toBe(false);
    expect(approvalWasDeclined(other, 'phone')).toBe(false);
  });

  it('is forgotten once the request is answered, its turn ends or its runtime stops', () => {
    const elsewhere = { ...approval, threadId: 'thread-2' };
    const mark = () => {
      for (const request of [approval, other, elsewhere]) noteApprovalDeclined(request, 'phone');
    };
    const declined = () =>
      [approval, other, elsewhere].map((request) => approvalWasDeclined(request, 'phone'));

    mark();
    noteApprovalSessionEvent('root-1', {
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      approved: false,
      decision: 'deny',
    });
    expect(declined()).toEqual([false, true, true]);

    mark();
    noteApprovalSessionEvent('root-1', {
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'completed',
      response: '',
      failure: null,
    });
    expect(declined()).toEqual([false, false, true]);

    mark();
    noteApprovalSessionEvent('root-2', { type: 'runtime-stopped', message: 'gone' });
    expect(declined()).toEqual([true, true, true]);
    noteApprovalSessionEvent('root-1', { type: 'runtime-stopped', message: 'gone' });
    expect(declined()).toEqual([false, false, false]);
  });

  it('keeps no more than it needs, dropping the oldest', () => {
    for (let index = 0; index < 600; index += 1) {
      noteApprovalDeclined({ ...approval, requestId: `ask-${index}` }, 'page');
    }

    expect(approvalWasDeclined({ ...approval, requestId: 'ask-0' }, 'page')).toBe(false);
    expect(approvalWasDeclined({ ...approval, requestId: 'ask-599' }, 'page')).toBe(true);
  });
});

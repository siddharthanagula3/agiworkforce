import { describe, expect, it } from 'vitest';

import { createControlReceiptLedger } from '../controlReceipts';

describe('control receipt ledger', () => {
  it('issues a versioned accepted receipt for a control it has not seen', () => {
    const ledger = createControlReceiptLedger();

    const receipt = ledger.record(
      'dispatch.task.create',
      'req-1',
      new Date('2026-08-17T10:00:00.000Z'),
    );

    expect(receipt).toEqual({
      action: 'control.receipt',
      version: 1,
      requestId: 'req-1',
      controlAction: 'dispatch.task.create',
      outcome: 'accepted',
      receivedAt: '2026-08-17T10:00:00.000Z',
    });
  });

  it('answers a replayed request id as a duplicate instead of a second acceptance', () => {
    const ledger = createControlReceiptLedger();
    ledger.record('dispatch.task.create', 'req-1', new Date('2026-08-17T10:00:00.000Z'));

    const replay = ledger.record(
      'dispatch.task.create',
      'req-1',
      new Date('2026-08-17T10:00:09.000Z'),
    );

    expect(replay.outcome).toBe('duplicate');
    expect(replay.requestId).toBe('req-1');
    expect(replay.receivedAt).toBe('2026-08-17T10:00:09.000Z');
    expect(ledger.size()).toBe(1);
  });

  it('keys a receipt on the control action as well as the request id', () => {
    const ledger = createControlReceiptLedger();
    ledger.record('dispatch.task.create', 'req-1');

    expect(ledger.record('dispatch.task.cancel', 'req-1').outcome).toBe('accepted');
    expect(ledger.size()).toBe(2);
  });

  it('never grows past its tracking bound', () => {
    const ledger = createControlReceiptLedger(3);

    for (let index = 0; index < 10; index += 1) {
      ledger.record('dispatch.task.create', `req-${index}`);
    }

    expect(ledger.size()).toBe(3);
    expect(ledger.record('dispatch.task.create', 'req-9').outcome).toBe('duplicate');
    expect(ledger.record('dispatch.task.create', 'req-0').outcome).toBe('accepted');
  });

  it('forgets every receipt when the companion session ends', () => {
    const ledger = createControlReceiptLedger();
    ledger.record('approval_response', 'req-1');

    ledger.clear();

    expect(ledger.size()).toBe(0);
    expect(ledger.record('approval_response', 'req-1').outcome).toBe('accepted');
  });
});

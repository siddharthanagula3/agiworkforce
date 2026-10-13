import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicRuntimeContainers } from './containers.mjs';
import { withPublicRuntimeCleanup } from './lifecycle.mjs';
import { digest } from './proof.mjs';

test('successful work closes once before returning its original result', async () => {
  const calls = [];
  const result = {};
  assert.equal(
    await withPublicRuntimeCleanup(
      async () => {
        calls.push('work');
        return result;
      },
      async () => {
        calls.push('close');
        return 'ignored close result';
      },
    ),
    result,
  );
  assert.deepEqual(calls, ['work', 'close']);
});

test('a work failure survives successful cleanup unchanged', async () => {
  const primary = new Error('browser readiness failed');
  let closes = 0;
  await assert.rejects(
    withPublicRuntimeCleanup(
      async () => {
        throw primary;
      },
      async () => {
        closes++;
      },
    ),
    (error) => error === primary,
  );
  assert.equal(closes, 1);
});

test('cleanup failure still rejects successful work with the original cleanup error', async () => {
  const cleanup = new Error('resource teardown failed');
  await assert.rejects(
    withPublicRuntimeCleanup(
      async () => 'work completed',
      async () => {
        throw cleanup;
      },
    ),
    (error) => error === cleanup,
  );
});

test('real harness proof-sealing failure is retained alongside the earlier work failure', async () => {
  const primary = new Error('main landmark was not found');
  const proof = { stateId: 'earlier-case' };
  const commands = [];
  const harness = Object.create(PublicRuntimeContainers.prototype);
  Object.assign(harness, {
    names: new Map(),
    volumes: new Set(),
    proofs: [proof],
    proofBindings: new WeakMap([
      [proof, { digest: digest(proof), expected: { stateId: proof.stateId } }],
    ]),
    runId: 'fixture-run',
    docker: async (args) => {
      commands.push(args);
      return '';
    },
  });
  await assert.rejects(
    withPublicRuntimeCleanup(
      async () => {
        throw primary;
      },
      () => harness.close(),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, primary);
      assert.equal(error.errors.length, 2);
      assert.equal(error.errors[0], primary);
      assert.match(error.errors[1].message, /Incomplete cold runtime proof for earlier-case/);
      return true;
    },
  );
  assert.deepEqual(
    commands.map((args) => args.slice(0, 2)),
    [
      ['ps', '--all'],
      ['volume', 'ls'],
    ],
  );
  assert.equal(proof.teardownComplete, true);
});

test('falsy thrown work values remain failures with and without a cleanup failure', async () => {
  for (const primary of [undefined, null, 0, false, '']) {
    for (const failsCleanup of [false, true]) {
      const cleanup = new Error('cleanup failed');
      let closes = 0;
      const outcome = await withPublicRuntimeCleanup(
        () => {
          throw primary;
        },
        () => {
          closes++;
          if (failsCleanup) throw cleanup;
        },
      ).then(
        (value) => ({ status: 'fulfilled', value }),
        (error) => ({ status: 'rejected', error }),
      );
      assert.equal(outcome.status, 'rejected');
      assert.equal(closes, 1);
      if (failsCleanup) {
        assert.ok(outcome.error instanceof AggregateError);
        assert.ok(Object.hasOwn(outcome.error, 'cause'));
        assert.equal(outcome.error.cause, primary);
        assert.deepEqual(outcome.error.errors, [primary, cleanup]);
      } else {
        assert.equal(outcome.error, primary);
      }
    }
  }
});

test('nested cleanup retains the primary, context close and harness close failures', async () => {
  const primary = new Error('main landmark was not found');
  const contextClose = new Error('browser context close failed');
  const harnessClose = new Error('runtime proof sealing failed');
  const calls = [];
  await assert.rejects(
    withPublicRuntimeCleanup(
      () =>
        withPublicRuntimeCleanup(
          () => {
            calls.push('work');
            throw primary;
          },
          () => {
            calls.push('context close');
            throw contextClose;
          },
        ),
      () => {
        calls.push('harness close');
        throw harnessClose;
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      const contextFailure = error.errors[0];
      assert.equal(error.cause, contextFailure);
      assert.equal(error.errors[1], harnessClose);
      assert.equal(error.errors.length, 2);
      assert.ok(contextFailure instanceof AggregateError);
      assert.equal(contextFailure.cause, primary);
      assert.deepEqual(contextFailure.errors, [primary, contextClose]);
      return true;
    },
  );
  assert.deepEqual(calls, ['work', 'context close', 'harness close']);
});

test('falsy cleanup failures cannot turn successful work into success', async () => {
  for (const cleanup of [undefined, null, 0]) {
    const outcome = await withPublicRuntimeCleanup(
      () => 'work completed',
      () => {
        throw cleanup;
      },
    ).then(
      (value) => ({ status: 'fulfilled', value }),
      (error) => ({ status: 'rejected', error }),
    );
    assert.deepEqual(outcome, { status: 'rejected', error: cleanup });
  }
});

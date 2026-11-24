import { expect, it } from 'vitest';
import { E2E_PROMPT_MARKER, startLocalModelFixture } from '../test/localModelFixture';

it('releases both held streams when two editor tasks run in parallel', async () => {
  const fixture = await startLocalModelFixture(20_000);
  const headers = { 'x-agi-e2e-token': fixture.controlToken };
  try {
    const send = (task: string) =>
      fetch(`${fixture.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: fixture.modelId,
          stream: true,
          stream_options: { include_usage: true },
          messages: [{ role: 'user', content: `${task} ${E2E_PROMPT_MARKER}` }],
        }),
      });
    const streams = await Promise.all([send('First task'), send('Second task')]);
    const held = await fetch(fixture.stateUrl, { headers });
    expect(await held.json()).toMatchObject({ chatRequests: 2, holdReleased: false, errors: [] });

    await fetch(fixture.releaseUrl, { method: 'POST', headers });
    const replies = await Promise.all(streams.map((stream) => stream.text()));
    expect(replies).toHaveLength(2);
    expect(replies.every((reply) => reply.endsWith('data: [DONE]\n\n'))).toBe(true);
  } finally {
    await fixture.close();
  }
});

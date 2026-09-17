import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

import { getJson, postJson, stages, thresholds } from './lib/config.js';

// §122 high queue volume and long-running agents, §123 queue workers.
//
// Submits durable runs and then reads them back, because the two numbers that
// matter are different: how fast a run is accepted, and whether it is still
// making progress once the queue is deep. A submission latency that stays flat
// while runs stop advancing is the failure this scenario exists to catch, and it
// is invisible to a scenario that only measures the POST.

const acceptLatency = new Trend('agi_run_accept_latency', true);
const runStillAdvancing = new Rate('agi_run_advancing');

export const options = {
  stages: stages(),
  thresholds: thresholds({
    agi_run_accept_latency: ['p(95)<1500'],
    // Below this, the queue is accepting work it is not doing, which reads as
    // healthy from the outside and is the exact shape of a silent backlog.
    agi_run_advancing: ['rate>0.95'],
  }),
};

export default function durableRuns() {
  const started = Date.now();
  const created = postJson(
    '/api/llm/v1/chat/completions',
    {
      model: 'auto',
      stream: false,
      messages: [{ role: 'user', content: 'Summarise the last release in two sentences.' }],
    },
    { timeout: '60s' },
  );
  acceptLatency.add(Date.now() - started);

  const accepted = check(created, {
    'run accepted': (r) => r.status === 200 || r.status === 202,
  });
  if (!accepted) {
    runStillAdvancing.add(false);
    sleep(1);
    return;
  }

  const listed = getJson('/api/llm/v1/chat/completions/runs?limit=5', { timeout: '20s' });
  check(listed, { 'runs listed': (r) => r.status === 200 });

  let advancing = false;
  try {
    const body = JSON.parse(listed.body ?? '{}');
    const runs = Array.isArray(body.runs) ? body.runs : [];
    // A run that is queued and a run that is running are both progress. A run
    // list that is entirely queued at peak is the backlog this measures.
    advancing = runs.length === 0 || runs.some((run) => run.status !== 'queued');
  } catch (error) {
    advancing = false;
  }
  runStillAdvancing.add(advancing);

  sleep(2);
}

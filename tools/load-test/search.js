import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';

import { getJson, stages, thresholds } from './lib/config.js';

// §122 millions of conversations and billions of messages, measured where a user
// feels it: retrieval over their own history.
//
// The search SLO has never been measured, because `search_history` records no
// failure (§90). This scenario is the instrument that would let it be, so the
// run's own error rate is the measurement rather than a proxy for it.
//
// Terms are deliberately ordinary and varied. One repeated term measures the
// query cache, not the index.

const latency = new Trend('agi_search_latency', true);

const terms = new SharedArray('terms', () => [
  'invoice',
  'deployment failed',
  'rate limit',
  'onboarding checklist',
  'postgres migration',
  'refund policy',
  'api key rotation',
  'weekly summary',
  'vector index',
  'browser automation',
]);

export const options = {
  stages: stages(),
  thresholds: thresholds({
    // Search has an availability objective in the SLO catalogue and no latency
    // one, so this is a working ceiling proposed by the scenario, not a
    // published target. Promote it into the catalogue, or drop it, once a run
    // has said what the system actually does.
    agi_search_latency: ['p(95)<800'],
    http_req_failed: ['rate<0.005'],
  }),
};

export default function search() {
  const term = terms[Math.floor(Math.random() * terms.length)];
  const mode = Math.random() < 0.5 ? 'lexical' : 'semantic';

  const response = getJson(`/api/search?q=${encodeURIComponent(term)}&limit=20&mode=${mode}`, {
    timeout: '20s',
  });

  latency.add(response.timings.duration);

  check(response, {
    'search answered 200': (r) => r.status === 200,
    'search returned a body': (r) => typeof r.body === 'string' && r.body.length > 0,
  });

  sleep(0.5);
}

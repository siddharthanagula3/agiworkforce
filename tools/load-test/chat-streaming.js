import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

import { authHeaders, baseUrl, stages, thresholds } from './lib/config.js';
import http from 'k6/http';

// §122 high concurrent streaming, and the concurrency ceiling on the completion
// path. Answers one question: how many simultaneous streaming turns the gateway
// carries before either time to first token or the error rate breaks its target.
//
// The model is `auto` on purpose. Pinning a model would measure that provider's
// queue rather than our routing, and a routed run is what production does.

const timeToFirstByte = new Trend('agi_stream_ttfb', true);
const streamCompleted = new Rate('agi_stream_completed');

export const options = {
  stages: stages(),
  thresholds: thresholds({
    // 3000ms is the `first-token` deadline in apps/web/lib/server/slo/catalogue.ts,
    // not a round number chosen here. Change it there, never here.
    agi_stream_ttfb: ['p(95)<3000'],
    agi_stream_completed: ['rate>0.99'],
    http_req_duration: ['p(95)<30000'],
  }),
};

export default function chatStreaming() {
  const started = Date.now();
  const response = http.post(
    `${baseUrl()}/api/llm/v1/chat/completions`,
    JSON.stringify({
      model: 'auto',
      stream: true,
      messages: [
        {
          role: 'user',
          content: 'In one sentence, what is the difference between a queue and a stack?',
        },
      ],
    }),
    { headers: authHeaders({ accept: 'text/event-stream' }), timeout: '60s' },
  );

  timeToFirstByte.add(Date.now() - started);

  const body = typeof response.body === 'string' ? response.body : '';
  const finished = body.includes('data: [DONE]');
  streamCompleted.add(finished);

  check(response, {
    'stream answered 200': (r) => r.status === 200,
    'stream is server-sent events': (r) =>
      String(r.headers['Content-Type'] ?? '').includes('text/event-stream'),
    'stream reached its terminator': () => finished,
  });

  sleep(1);
}

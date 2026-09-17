import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

import { baseUrl, bearerToken, stages, thresholds } from './lib/config.js';

// §122 large files.
//
// The chat attachment upload passes its body through the application rather than
// straight to the object store, so the question is whether the request path
// stays responsive while large bodies are in flight. That is a property of our
// process, not of the object store's throughput.
//
// The body is generated, never read from disk: a scenario that needs a fixture
// file is a scenario that quietly stops running when the fixture moves. Keep
// AGI_LOAD_UPLOAD_MB under the route's own 12 MiB cap, or every iteration
// measures the validation path instead of the upload path.

const uploadLatency = new Trend('agi_upload_latency', true);
const uploadSucceeded = new Rate('agi_upload_succeeded');

const MEGABYTE = 1024 * 1024;
const sizeMb = Number(__ENV.AGI_LOAD_UPLOAD_MB ?? 8);
const payload = new Uint8Array(sizeMb * MEGABYTE).buffer;

export const options = {
  stages: stages(),
  thresholds: thresholds({
    agi_upload_succeeded: ['rate>0.99'],
    agi_upload_latency: ['p(95)<20000'],
    http_req_duration: ['p(95)<30000'],
  }),
};

export default function largeUploads() {
  const userId = __ENV.AGI_LOAD_USER_ID;
  if (!userId) {
    throw new Error(
      'AGI_LOAD_USER_ID is required: the upload key is owner-scoped and a mismatched key is refused before any bytes move.',
    );
  }

  const key = `chat-attachments/${userId}/load-${__VU}-${__ITER}.bin`;
  const started = Date.now();
  const response = http.put(
    `${baseUrl()}/api/uploads/chat-attachment/put?key=${encodeURIComponent(key)}`,
    payload,
    {
      headers: {
        authorization: `Bearer ${bearerToken()}`,
        'content-type': 'application/octet-stream',
      },
      timeout: '120s',
    },
  );
  uploadLatency.add(Date.now() - started);
  uploadSucceeded.add(response.status === 200);

  check(response, {
    'upload accepted': (r) => r.status === 200,
    'upload was not refused for size': (r) => r.status !== 413 && r.status !== 400,
  });

  sleep(1);
}

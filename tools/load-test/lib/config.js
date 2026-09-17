import http from 'k6/http';

// Shared configuration for every scenario in this directory.
//
// Nothing here has a default that points at production. A run needs an explicit
// AGI_LOAD_BASE_URL, so a scenario cannot be started against the live service by
// forgetting a flag.

export function baseUrl() {
  const value = __ENV.AGI_LOAD_BASE_URL;
  if (!value) {
    throw new Error('AGI_LOAD_BASE_URL is required; there is no default target.');
  }
  if (!/^https?:\/\//.test(value)) {
    throw new Error(`AGI_LOAD_BASE_URL must be an absolute URL, got "${value}".`);
  }
  return value.replace(/\/+$/, '');
}

export function bearerToken() {
  const value = __ENV.AGI_LOAD_TOKEN;
  if (!value) {
    throw new Error(
      'AGI_LOAD_TOKEN is required; the authenticated paths cannot be probed without it.',
    );
  }
  return value;
}

export function authHeaders(extra = {}) {
  return {
    authorization: `Bearer ${bearerToken()}`,
    'content-type': 'application/json',
    ...extra,
  };
}

/**
 * Stage shape shared by every scenario, read from the environment so one script
 * serves a smoke run, a soak and a spike without editing it.
 *
 *   AGI_LOAD_VUS       peak virtual users        default 10
 *   AGI_LOAD_RAMP      ramp to peak              default 30s
 *   AGI_LOAD_HOLD      time at peak              default 1m
 */
export function stages() {
  const vus = Number(__ENV.AGI_LOAD_VUS ?? 10);
  const ramp = __ENV.AGI_LOAD_RAMP ?? '30s';
  const hold = __ENV.AGI_LOAD_HOLD ?? '1m';
  return [
    { duration: ramp, target: vus },
    { duration: hold, target: vus },
    { duration: '10s', target: 0 },
  ];
}

/**
 * A scenario asserts the SLO it belongs to, not a round number somebody liked.
 * `docs/runbooks/capacity-and-load-testing.md` names which target each threshold
 * comes from; changing one here without changing it there makes the run
 * unfalsifiable.
 */
export function thresholds(overrides = {}) {
  return {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    ...overrides,
  };
}

export function getJson(path, params = {}) {
  return http.get(`${baseUrl()}${path}`, { headers: authHeaders(), ...params });
}

export function postJson(path, body, params = {}) {
  return http.post(`${baseUrl()}${path}`, JSON.stringify(body), {
    headers: authHeaders(),
    ...params,
  });
}

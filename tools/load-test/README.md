# tools/load-test

Status: Current
Owner: Platform lead
Last updated: 2026-09-17

k6 scenarios for the capacity targets. The targets themselves, and what each
threshold in these scripts comes from, live in
`docs/runbooks/capacity-and-load-testing.md`.

**A number in that document is only true if a run in this directory produced
it.** `AGENTS.md` section 8 is explicit: a concurrency figure is a capacity
target that must be proven by measurement, never claimed without a live run
behind it. These scripts are the instrument; they are not evidence on their own.

## Running one

k6 is not a repository dependency and is not installed by `pnpm install`. Install
it from k6.io, then:

```
AGI_LOAD_BASE_URL=https://<target> \
AGI_LOAD_TOKEN=<session bearer token> \
AGI_LOAD_VUS=50 AGI_LOAD_RAMP=1m AGI_LOAD_HOLD=5m \
k6 run tools/load-test/search.js
```

There is no default target. `lib/config.js` throws without an explicit
`AGI_LOAD_BASE_URL`, so a scenario cannot be pointed at production by forgetting
a flag.

| Variable             | Meaning                                                   | Default              |
| -------------------- | --------------------------------------------------------- | -------------------- |
| `AGI_LOAD_BASE_URL`  | target origin                                             | none, required       |
| `AGI_LOAD_TOKEN`     | bearer token for the authenticated paths                  | none, required       |
| `AGI_LOAD_VUS`       | peak virtual users                                        | 10                   |
| `AGI_LOAD_RAMP`      | ramp to peak                                              | 30s                  |
| `AGI_LOAD_HOLD`      | time at peak                                              | 1m                   |
| `AGI_LOAD_USER_ID`   | owner id for the upload key (`large-uploads`)             | none, required there |
| `AGI_LOAD_UPLOAD_MB` | body size for `large-uploads`, under the 12 MiB route cap | 8                    |

## The scenarios

| File                | Measures                                                          |
| ------------------- | ----------------------------------------------------------------- |
| `chat-streaming.js` | concurrent streaming turns: time to first byte, stream completion |
| `search.js`         | retrieval over conversation history, lexical and semantic         |
| `durable-runs.js`   | queue volume: acceptance latency, and whether runs still advance  |
| `large-uploads.js`  | the request path under large bodies                               |

## Rules a run has to follow to mean anything

- **Never against production.** A load run against the live service is an
  outage you scheduled. Use a preview deployment sized like production, and say
  in the result which one.
- **Your own traffic is not the product's.** `AGENTS.md` section 1: a harness is
  a source like any other. Record the generator's location and its own CPU, and
  discard a run where the generator saturated before the target did.
- **A threshold that fails is the answer.** Relaxing a threshold to make a run
  green deletes the measurement. Change the target in the runbook, with the
  reason, or fix the system.
- **Report the shape, not just the percentile.** A p95 that holds while the
  error rate climbs is a system shedding load, which is a different result from
  one that is coping.
- **One variable per run.** A run that changed both the concurrency and the
  instance size answers neither question.

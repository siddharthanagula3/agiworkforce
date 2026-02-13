# LLM Proxy SLO: Time to First Token (TTFT)

## Scope

This SLO applies to hosted streaming completions served by:

- `/api/llm/v1/chat/completions` (streaming mode)

It measures user-perceived responsiveness from request dispatch to first content token.

## SLI Definition

- **Metric name:** `ttft_ms`
- **Measurement point:** first non-empty text delta observed in SSE stream
- **Start time:** immediately before provider stream request is initiated
- **End time:** arrival of first response content delta

Instrumentation events (structured logs):

- `llm_ttft_observed` with `ttftMs`, `provider`, `model`, `requestId`
- `llm_ttft_slo_breach` when TTFT breaches threshold
- `llm_ttft_missing` when stream ends without observable first token

## SLO Targets

- **Objective (rolling 28 days):** `P95(ttft_ms) <= 2500ms`
- **Hard breach threshold:** `ttft_ms > 5000ms` on any request should create a warning signal
- **Availability companion SLO:** `< 0.5%` of streaming requests end in `ttft_missing`

Environment overrides:

- `LLM_TTFT_SLO_TARGET_MS` (default `2500`)
- `LLM_TTFT_SLO_BREACH_MS` (default `5000`)

## Alerting Policy

- **Page (SEV2):**
  - 15-minute window: `P95(ttft_ms) > 5000ms`
  - or `ttft_missing_rate > 2%`
- **Ticket (SEV3):**
  - 1-hour window: `P95(ttft_ms) > 2500ms`
  - or model/provider-specific `P95` degradation > 30% week-over-week

## Incident Response Playbook

1. Confirm blast radius:
   - Global vs provider-specific vs model-specific
   - Free/pro/max tier segmentation impact
2. Check recent changes:
   - Routing config, auth middleware, rate-limits, provider SDK updates
3. Triage bottleneck:
   - Provider queue latency
   - Auth/credit checks before stream start
   - Network egress saturation
4. Mitigate:
   - Failover to lower-latency fallback model
   - Reduce aggressive pre-stream sync work
   - Temporarily shift traffic weights away from degraded provider
5. Verify recovery:
   - `P50/P95/P99` TTFT normalize
   - breach logs return to baseline

## Reporting

Weekly reliability report should include:

- P50/P95/P99 TTFT by provider/model
- Top 5 breach contributors
- `ttft_missing` rate
- Error-budget burn for TTFT SLO

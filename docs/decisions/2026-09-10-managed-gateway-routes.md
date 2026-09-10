# Managed routes for vendors whose own endpoints are excluded

Status: Pending founder decision
Owner: Fable (architect) with the founder
Last updated: 2026-09-10

One decision in the living decision model's shape
(`2026-09-05-living-decision-model.md`), kept in its own file because the
model itself carried uncommitted edits when this was written. Fold it in
when the founder decides.

## D-2026-09-10-01 DeepSeek and Moonshot have no managed route on main

- Question: which transport may serve the DeepSeek defaults, the Moonshot
  flagship and the second route of the Zhipu default to Managed Cloud users now that the vendors' own endpoints
  are excluded from managed dispatch.
- Evidence: cb8ee76d9 (2026-09-08) keeps managed routing off the endpoints
  the model vendors operate outside the United States and measured one
  route change across 240 Auto combinations. It did not measure explicit
  model selection. On main's registry the `vercel_gateway/chat-completions`
  harness is BYOK-only, DeepSeek's OpenRouter routes sit on the BYOK-only
  `open-router/chat-completions` harness (1035ecd48 admitted only MiniMax,
  Qwen and Zhipu to the managed one), and every re-hoster route is
  `experimental_only`. An explicit request for either DeepSeek default or the
  Moonshot flagship from a managed user resolves
  `explicit_model_ineligible` and the API answers 422
  `model_route_unavailable`. No model has two managed routes off excluded
  transports, so warm-route affinity has no real data to exercise. Three
  test sites now derive their fixtures from the registry and skip with a
  stated reason, annotated for check:llm-failures against this decision.
- Current implementation: uncommitted registry work in the shared checkout
  (verified 2026-09-06) promotes `vercel_gateway/chat-completions` to
  `managed_cloud` with a native zero-data-retention-on-request feature,
  moves two gateways from `zero_retention` to `conditional`, adds the
  Experiential Labs and Workers AI gateways, and flips many routes from
  `experimental_only` to `authorized_marketplace`. f787dc96e's message
  says such routes stay experimental until the founder confirms commercial
  terms, so that work was not committed as part of the CI repair.
- Options: (a) promote the Vercel gateway harness to managed traffic as the
  uncommitted work does, consistent with locked decision 8 in
  `README.md` (gateways only behind explicit Managed labelling); (b) move
  DeepSeek's OpenRouter routes to the managed OpenRouter harness, the
  precedent set for MiniMax, Qwen and Zhipu, which depends on OpenRouter's
  provider pinning keeping inference on zero-retention US hosts; (c) leave
  DeepSeek and Moonshot off the managed catalogue and say so in the picker.
- Decision: pending the founder. The routing tests stay honest either way:
  the affinity block and the explicit DeepSeek dispatch case run again as
  soon as any option lands a managed route.
- Why: each option is a commercial-terms and data-residency commitment,
  which the founder reserves.
- Tradeoff: until decided, the two DeepSeek defaults and the Moonshot
  flagship are unroutable for managed users while still listed, and the Zhipu default has a
  single managed route.
- Reversibility: high; a catalogue edit and a registry regenerate.
- Revisit trigger: the founder's answer, or a user report of the 422 on an
  explicit DeepSeek or Moonshot selection.

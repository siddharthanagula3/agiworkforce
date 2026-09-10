# Decisions pending the founder, 2026-09-10

Status: Pending founder decision
Owner: Fable (architect) with the founder
Last updated: 2026-09-10

Decisions in the living decision model's shape
(`2026-09-05-living-decision-model.md`), kept in their own file because the
model itself carried uncommitted edits when this was written. Fold them in
when the founder decides.

## D-2026-09-10-02 Tool-approval defaults versus the leaders

- Question: whether sandboxed code execution and web search may run without
  an approval prompt when the account's default is "run read-only actions
  without asking".
- Evidence: observed 2026-09-10 on the dev server with the QA account. A CSV
  analysis on GPT-5.6 Luna needed two manual approvals, one per code step,
  before the totals, chart and workbook appeared; a project knowledge question
  asked from the project composer paused for approval of a code action.
  Settings → Capabilities states that even the permissive mode asks before
  anything that "writes, deletes, runs code, or can move data outside AGI,
  including web search and page fetches"; that gate was deliberately extended
  to web search on 2026-09-08 (`ACTIVE_ISSUES.md`, closed browser item). The
  AGI Work banner under a paused approval reads "Automatic approval is on",
  which contradicts the policy and is fixed as copy regardless of this decision.
- Current implementation: `apps/web/shared/types/toolApprovalPolicy.ts` and
  the Capabilities section; execute_code and search are classed with writes.
- Options: (a) keep the gate as it stands and make the copy say so; (b) class
  sandboxed code execution and web search as read-only in the permissive mode,
  keeping connector writes and anything that leaves AGI on ask; (c) make the
  permissive mode the default for new accounts as well as (b).
- Decision: pending the founder; the founder set the current gate.
- Why: the gate is a security posture against prompt-injected exfiltration
  through the sandbox network and search queries; the leaders accept that risk
  for a frictionless analysis flow.
- Tradeoff: until decided, the default-model analysis flow costs two approval
  clicks that neither leader asks for.
- Reversibility: high; a policy table and copy.
- Revisit trigger: the founder's answer, or user feedback naming the approval
  friction.

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

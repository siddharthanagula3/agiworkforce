# Code knowledge graph: bounded reconstruction

Status: Source snapshot, not runtime acceptance
Owner: Platform + application maintainers
Last updated: 2026-11-04

## Provenance and coverage

This document maps only the source reconstructed and independently read on
`fix/recovered-core-safety`, starting from `ee717702b0`. It is not a recovered
copy of the earlier architecture graph or an exhaustive codebase audit.

Coordination history reports that the earlier 217-commit working branch and
local recovery bundles became unavailable after an environment rollback. Those
remembered changes are not evidence of code present in this checkout. They are
not listed as implemented here. Fresh source and accepted commit identities,
not conversation recollection, determine the entries below. External backup
handling is separate; this document does not certify backup restoration.

The repository's architecture owners remain `overview.md`, `trust-boundaries.md`
and root `ARCHITECTURE.md`. This dated map supplements them; defects and release
acceptance belong in the existing `audit/` owners, not a duplicate tracker here.
No tests, checks, builds, formatters, network requests or runtime probes were
performed for this map. Authored regression sources remain unexecuted.

## Private shared-reader cookie admission

Reconstructed commit: `0edf21eb459dd54fb0b8d74c15fbb7b1d12ff580`.
The eleven-file group includes five production files and six regression sources.
The source diff and canonical admission/governing-organization helpers were read.

Ownership graph:

- `/share/[token]` page and `/api/share/[token]` GET first attempt the existing
  public shared-session read. The published-artifact page similarly tries its
  public artifact read first. Public success does not require cookie admission.
- Only the authenticated fallback calls
  `lib/server/rls-db.ts::getCurrentCookieUserRlsDb(request)`. The API passes its
  actual request; server pages construct a request using incoming headers and
  their canonical page URL, retaining network-policy context.
- That helper captures one cookie identity, invokes
  `lib/api-auth.ts::getCookieSessionAuthUser` with it, and only afterward obtains
  that identity's token and constructs `withUser(token)` RLS scope. Missing
  identity/token or admission 401/403 returns no private reader; other admission
  failures propagate from the helper. Page callers retain their unavailable
  fallback. Returned user identity is the canonical mapped account, not an
  independently trusted raw provider subject.
- The extracted cookie admission is also used by the existing API-auth cookie
  branch. It retains absolute session lifetime, active-account/account-security,
  MFA and IP allow-list gates, tenant context and session sighting. Bearer
  credentials do not become an alternative identity for this cookie-only reader.
- Existing RLS decides whether the admitted account can read the organization
  session/artifact. The artifact's invited-reader fallback remains after its
  organization read. Admission does not add selected-workspace equality:
  `governing-organizations.ts` intentionally supplies all governing organizations
  for account-level policy, independent of the selected workspace/header.

This closes the inspected private-reader admission omission at the source level;
it does not change public audience semantics, prove deployed RLS behavior,
provide continuous revocation after a read, or establish a cache/attachment/bearer
bypass. The older generic `getCurrentUserRlsDb` remains for other callers and is
not globally migrated by this slice. The canonical account gate retains its
selected-workspace lockdown lookup, not a new lockdown check against the actual
shared resource's organization. RLS still uses the cookie's raw JWT; the existing
provider-subject versus canonical-account mapping in database authorization is
unchanged and is not claimed resolved. Regression source covers cookie refusal,
missing token, mapped account, unavailable admission, public-first reads and
organization/invited fallback; no runtime acceptance is claimed.

## Reconstruction boundary

Checkpoint policy and dirty-sync work were pending when this snapshot was
written. Neither is counted as reconstructed here. Add a source trace only after
its accepted commit is available and independently read. Other remembered
changes from the unavailable branch require fresh reconstruction or recoverable
Git evidence before they can be represented as current implementation.

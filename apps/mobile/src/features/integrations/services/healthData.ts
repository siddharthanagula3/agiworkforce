// STB-21 TOMBSTONE — delete this file with `git rm` on a normal checkout.
//
// The Health Data bridge read from `GET /api/health-context`, a route that does
// not exist in apps/web/app/api, in services/api-gateway, or anywhere else in
// this repo — it was only ever going to be served by the external "HxF" iOS app's
// backend, which was never built here. The service fired that request twice
// whenever the Integrations screen opened and swallowed the resulting 404, so the
// card rendered an empty state indistinguishable from "no data yet".
//
// A feature flag (EXPO_PUBLIC_FEATURE_HEALTH_CONTEXT, default off) had been added
// as a stopgap, with the file's own note: "Open design decision (tracked): add a
// GET /api/health-context endpoint, or retire this service." Retired. Flipping
// that flag on could only ever produce a silently-empty card.
//
// The Health entries in the Integrations settings screen, DeviceIntegrationStatus,
// and the integrations store were removed with it. Restoring this feature means
// building the endpoint first, then re-adding a UI that surfaces its failures.
export {};

/**
 * Outbound-worker protocol barrel.
 *
 * Mounts the three worker sub-routers onto the Express app:
 *   - registrationRouter  — POST /v1/environments/bridge, /archive, /bridge (epoch bump)
 *                           POST /api/auth/trusted_devices
 *   - assignmentRouter    — GET /poll, POST /ack /complete /stop
 *   - heartbeatRouter     — POST /heartbeat (work-level), GET /heartbeat (worker-level)
 *
 * Also exports `startHeartbeatSweep()` so `index.ts` can start the background
 * stale-worker cleanup process after the server is listening.
 *
 * Backward-compat: the existing inbound bridge at `/ws` and all legacy routes
 * remain live.  Clients that haven't migrated continue to work.  This module
 * adds the outbound direction without removing anything.
 *
 * Migration window: 30 days post-deploy.  Track via `worker_registrations.worker_type`
 * — once that table shows no more `desktop`/`cli` rows using the legacy path,
 * remove the backward-compat comment from docs/architecture/worker-protocol.md.
 */

export { registrationRouter } from './registration';
export { assignmentRouter } from './assignment';
export { heartbeatRouter, startHeartbeatSweep, stopHeartbeatSweep } from './heartbeat';
export {
  encodeWorkSecret,
  decodeWorkSecret,
  validateBridgeId,
  WORK_SECRET_VERSION,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_OFFLINE_THRESHOLD_MS,
  type WorkSecret,
  type WorkerType,
  type WorkerStatus,
  type WorkerRegistration,
  type WorkUnit,
  type WorkUnitStatus,
  type AuthTier,
  type StepUpRequired,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcSuccess,
  type JsonRpcError,
} from './types';

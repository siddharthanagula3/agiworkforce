import type { NonSteerableTurnKind } from './NonSteerableTurnKind';

export type AgiworkforceErrorInfo =
  | 'context_window_exceeded'
  | 'usage_limit_exceeded'
  | 'server_overloaded'
  | 'cyber_policy'
  | { http_connection_failed: { http_status_code: number | null } }
  | { response_stream_connection_failed: { http_status_code: number | null } }
  | 'internal_server_error'
  | 'unauthorized'
  | 'bad_request'
  | 'sandbox_error'
  | { response_stream_disconnected: { http_status_code: number | null } }
  | { response_too_many_failed_attempts: { http_status_code: number | null } }
  | { active_turn_not_steerable: { turn_kind: NonSteerableTurnKind } }
  | 'thread_rollback_failed'
  | 'other';

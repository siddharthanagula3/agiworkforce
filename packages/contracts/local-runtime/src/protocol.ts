import type { DesktopCapability, PermissionRequest, PermissionScope } from './capabilities';

export const DESKTOP_RUNTIME_CHANNEL = 'agi:desktop-runtime';
export const DESKTOP_RUNTIME_EVENT_CHANNEL = 'agi:desktop-runtime-event';

export const DESKTOP_RUNTIME_ERROR_CODES = [
  'unknown-command',
  'invalid-arguments',
  'permission-denied',
  'outside-workspace',
  'not-found',
  'not-a-directory',
  'not-a-file',
  'too-large',
  'io-error',
  'unsupported-platform',
  'cancelled',
] as const;

export type DesktopRuntimeErrorCode = (typeof DESKTOP_RUNTIME_ERROR_CODES)[number];

export interface DesktopRuntimeErrorShape {
  code: DesktopRuntimeErrorCode;
  message: string;
  /** Present on `permission-denied`, so the caller can raise the right prompt. */
  capability?: DesktopCapability;
  scope?: PermissionScope;
}

export interface DesktopRuntimeRequest {
  command: string;
  args?: Record<string, unknown>;
}

export type DesktopRuntimeResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: DesktopRuntimeErrorShape };

export function runtimeFailure(
  code: DesktopRuntimeErrorCode,
  message: string,
  extra?: { capability?: DesktopCapability; scope?: PermissionScope },
): DesktopRuntimeResponse<never> {
  const error: DesktopRuntimeErrorShape = { code, message };
  if (extra?.capability) error.capability = extra.capability;
  if (extra?.scope) error.scope = extra.scope;
  return { ok: false, error };
}

export function runtimeSuccess<T>(value: T): DesktopRuntimeResponse<T> {
  return { ok: true, value };
}

export class DesktopRuntimeError extends Error {
  readonly code: DesktopRuntimeErrorCode;
  readonly capability?: DesktopCapability;
  readonly scope?: PermissionScope;

  constructor(shape: DesktopRuntimeErrorShape) {
    super(shape.message);
    this.name = 'DesktopRuntimeError';
    this.code = shape.code;
    if (shape.capability) this.capability = shape.capability;
    if (shape.scope) this.scope = shape.scope;
  }

  toPermissionRequest(reason: string): PermissionRequest | null {
    if (!this.capability || !this.scope) return null;
    return { capability: this.capability, scope: this.scope, reason };
  }
}

export type DesktopRuntimeEvent =
  | { kind: 'workspace-changed'; rootId: string }
  | {
      kind: 'file-changed';
      rootId: string;
      path: string;
      change: 'created' | 'modified' | 'deleted';
    }
  | { kind: 'permission-changed'; capability: DesktopCapability; scope: PermissionScope };

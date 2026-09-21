export interface StepUpActionSpec {
  /** How long a proof of a fresh second factor stays usable for this action. */
  readonly freshnessSeconds: number;
  /** Shown to the person being challenged, so the prompt names the consequence. */
  readonly consequence: string;
}

/**
 * The actions that demand a fresh second factor. A route names one of these;
 * nothing else in the product decides its own freshness window.
 */
export const STEP_UP_ACTIONS = {
  'organization.transfer_ownership': {
    freshnessSeconds: 300,
    consequence:
      'Ownership of this workspace moves to another member. You cannot take it back yourself.',
  },
  'account.delete': {
    freshnessSeconds: 300,
    consequence: 'Your account and its content are scheduled for deletion.',
  },
  'two_factor.disable': {
    freshnessSeconds: 300,
    consequence: 'Two-factor authentication is switched off for your account.',
  },
  'two_factor.regenerate_backup_codes': {
    freshnessSeconds: 300,
    consequence: 'Your existing backup codes stop working immediately.',
  },
  'identity.unlink': {
    freshnessSeconds: 300,
    consequence: 'That sign-in method can no longer reach this account.',
  },
  'email.change': {
    freshnessSeconds: 300,
    consequence: 'Password resets and security notices go to the new address.',
  },
  'api_credential.reveal': {
    freshnessSeconds: 120,
    consequence: 'The secret is shown in full and can be copied.',
  },
  'session.revoke_all': {
    freshnessSeconds: 300,
    consequence: 'Every other signed-in device is signed out.',
  },
  'security.compromise_resolve': {
    freshnessSeconds: 300,
    consequence:
      'The hold on your account is lifted and you are no longer asked to reset your password.',
  },
  'encryption_key.rotate': {
    freshnessSeconds: 300,
    consequence:
      'This workspace starts sealing new data under a new key version. The old version stays readable until a rewrap retires it.',
  },
  'encryption_key.replace': {
    freshnessSeconds: 300,
    consequence:
      'This workspace moves to a different key, and with it a different vendor and region. The previous version stays in the ring until a rewrap retires it.',
  },
  'encryption_key.revoke': {
    freshnessSeconds: 300,
    consequence:
      'Everything this workspace has sealed stops opening, including backups. Restoring the key in your own KMS is the only way back.',
  },
  'encryption_key.retire': {
    freshnessSeconds: 300,
    consequence:
      'The old key version is dropped for good. Anything still sealed under it could never be opened again, which is why this only runs after a rewrap has covered every store.',
  },
} as const satisfies Record<string, StepUpActionSpec>;

export type StepUpAction = keyof typeof STEP_UP_ACTIONS;

export const STEP_UP_ACTION_IDS = Object.keys(STEP_UP_ACTIONS) as readonly StepUpAction[];

export function isStepUpAction(value: unknown): value is StepUpAction {
  return typeof value === 'string' && Object.hasOwn(STEP_UP_ACTIONS, value);
}

export function stepUpActionSpec(action: StepUpAction): StepUpActionSpec {
  return STEP_UP_ACTIONS[action];
}

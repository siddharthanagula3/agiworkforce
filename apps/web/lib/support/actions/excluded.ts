
export type ExcludedSupportActionId =
  | 'delete_account'
  | 'cancel_subscription'
  | 'change_plan'
  | 'remove_member'
  | 'transfer_ownership';

export interface ExcludedSupportAction {
  id: ExcludedSupportActionId;
  reason: string;
  control: { label: string; href: string };
}

export const EXCLUDED_SUPPORT_ACTIONS: Readonly<
  Record<ExcludedSupportActionId, ExcludedSupportAction>
> = Object.freeze({
  delete_account: Object.freeze({
    id: 'delete_account',
    reason:
      'Deleting an account is permanent and cannot be undone, so a support assistant will not do it for you. You do it yourself from account settings.',
    control: { label: 'Account settings', href: '/settings/account' },
  }),
  cancel_subscription: Object.freeze({
    id: 'cancel_subscription',
    reason:
      'Cancelling changes what you are charged, so it goes through the billing portal where you can see the effective date and what you keep until then.',
    control: { label: 'Billing', href: '/settings/billing' },
  }),
  change_plan: Object.freeze({
    id: 'change_plan',
    reason:
      'Changing a plan changes what you pay. You should see the price and terms before it happens, so it goes through the pricing page and the checkout you control.',
    control: { label: 'Plans and pricing', href: '/pricing' },
  }),
  remove_member: Object.freeze({
    id: 'remove_member',
    reason:
      'Removing a member takes away another person’s access. A support assistant will not act on someone else’s account — an owner or admin does it from team settings.',
    control: { label: 'Team members', href: '/settings/team' },
  }),
  transfer_ownership: Object.freeze({
    id: 'transfer_ownership',
    reason:
      'Ownership transfer is irreversible from the assistant’s side and affects billing and access for everyone in the organization.',
    control: { label: 'Team settings', href: '/settings/team' },
  }),
}) as Readonly<Record<ExcludedSupportActionId, ExcludedSupportAction>>;

export const EXCLUDED_SUPPORT_ACTION_IDS: readonly ExcludedSupportActionId[] = Object.freeze(
  Object.keys(EXCLUDED_SUPPORT_ACTIONS) as ExcludedSupportActionId[],
);

export function isExcludedSupportAction(id: string): id is ExcludedSupportActionId {
  return Object.prototype.hasOwnProperty.call(EXCLUDED_SUPPORT_ACTIONS, id);
}

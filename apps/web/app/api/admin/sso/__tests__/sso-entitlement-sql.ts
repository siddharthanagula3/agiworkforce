export interface SsoEntitlementWorld {
  memberships: ReadonlyArray<{ organization_id: string; role: string }>;
  billingUserId: string;
}

export function answerSsoEntitlementSql(
  text: string,
  world: SsoEntitlementWorld,
): Array<Record<string, unknown>> | null {
  if (text === 'select organization_id, role from organization_members where user_id = $1') {
    return world.memberships.map((membership) => ({ ...membership }));
  }
  if (text.includes('from public.organizations o left join public.subscriptions s')) {
    return [{ user_id: world.billingUserId, plan_tier: null, status: null }];
  }
  if (text.includes('from public.organizations o where o.owner_user_id = $1')) {
    return world.memberships.map(({ organization_id }) => ({ organization_id }));
  }
  if (text.includes('from public.organization_billing_contracts')) {
    return [];
  }
  return null;
}

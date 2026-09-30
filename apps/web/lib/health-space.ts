export const HEALTH_SPACE_KIND = 'health';
export const HEALTH_SPACE_SHARE_CONSTRAINT = 'organization_shared_projects_health_space';

export function isHealthSpaceViolation(error: unknown, constraint: string): boolean {
  return (error as Record<string, unknown> | null)?.['constraint'] === constraint;
}

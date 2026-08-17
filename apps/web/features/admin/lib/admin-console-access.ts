import { isOrganizationAdminRole, type OrganizationRole } from '@agiworkforce/types';

export const ADMIN_CONSOLE_PATH = '/admin';

export function hasAdminConsoleAccess(publicMetadata: unknown): boolean {
  if (!publicMetadata || typeof publicMetadata !== 'object') return false;
  const role = (publicMetadata as Record<string, unknown>)['role'];
  if (typeof role !== 'string') return false;
  return isOrganizationAdminRole(role as OrganizationRole);
}

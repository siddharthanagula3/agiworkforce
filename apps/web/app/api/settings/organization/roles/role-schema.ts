import { z } from 'zod';
import { GRANTABLE_ORGANIZATION_PERMISSIONS } from '@agiworkforce/types';

const PermissionSchema = z.enum(GRANTABLE_ORGANIZATION_PERMISSIONS as [string, ...string[]]);

export const CustomRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable().default(null),
    permissions: z.array(PermissionSchema).min(1).max(GRANTABLE_ORGANIZATION_PERMISSIONS.length),
    // The role's own counter, not the workspace revision: two administrators
    // editing different roles must not conflict with each other.
    version: z.number().int().nonnegative().nullable().default(null),
  })
  .strict();

export const RoleIdListSchema = z.object({ roleIds: z.array(z.string().uuid()).max(50) }).strict();

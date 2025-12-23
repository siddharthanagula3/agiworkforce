export enum UserRole {
  Viewer = 'viewer',
  Editor = 'editor',
  Admin = 'admin',
}

export enum Permission {
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  FILE_EXECUTE = 'file:execute',

  AUTOMATION_RUN = 'automation:run',
  AUTOMATION_CREATE = 'automation:create',
  AUTOMATION_DELETE = 'automation:delete',

  SETTINGS_READ = 'settings:read',
  SETTINGS_WRITE = 'settings:write',

  API_KEY_READ = 'api_key:read',
  API_KEY_WRITE = 'api_key:write',
  API_KEY_DELETE = 'api_key:delete',

  TERMINAL_EXECUTE = 'terminal:execute',

  BROWSER_CONTROL = 'browser:control',

  DATABASE_QUERY = 'database:query',
  DATABASE_MODIFY = 'database:modify',

  USER_MANAGE = 'user:manage',
  SYSTEM_CONFIGURE = 'system:configure',
}

const PERMISSION_MATRIX: Record<UserRole, Permission[]> = {
  [UserRole.Viewer]: [Permission.FILE_READ, Permission.SETTINGS_READ, Permission.API_KEY_READ],
  [UserRole.Editor]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_EXECUTE,
    Permission.AUTOMATION_RUN,
    Permission.AUTOMATION_CREATE,
    Permission.AUTOMATION_DELETE,
    Permission.SETTINGS_READ,
    Permission.SETTINGS_WRITE,
    Permission.API_KEY_READ,
    Permission.API_KEY_WRITE,
    Permission.TERMINAL_EXECUTE,
    Permission.BROWSER_CONTROL,
    Permission.DATABASE_QUERY,
  ],
  [UserRole.Admin]: Object.values(Permission),
};

export class PermissionManager {
  static hasPermission(role: UserRole, permission: Permission): boolean {
    const permissions = PERMISSION_MATRIX[role];
    return permissions.includes(permission);
  }

  static hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
    return permissions.every((permission) => this.hasPermission(role, permission));
  }

  static hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
    return permissions.some((permission) => this.hasPermission(role, permission));
  }

  static getPermissionsForRole(role: UserRole): Permission[] {
    return PERMISSION_MATRIX[role];
  }

  static requiresConfirmation(permission: Permission): boolean {
    const dangerousPermissions = [
      Permission.FILE_DELETE,
      Permission.FILE_EXECUTE,
      Permission.AUTOMATION_DELETE,
      Permission.DATABASE_MODIFY,
      Permission.USER_MANAGE,
      Permission.SYSTEM_CONFIGURE,
    ];

    return dangerousPermissions.includes(permission);
  }

  static getPermissionDescription(permission: Permission): string {
    const descriptions: Record<Permission, string> = {
      [Permission.FILE_READ]: 'Read files and directories',
      [Permission.FILE_WRITE]: 'Create and modify files',
      [Permission.FILE_DELETE]: 'Delete files and directories',
      [Permission.FILE_EXECUTE]: 'Execute files and scripts',
      [Permission.AUTOMATION_RUN]: 'Run automation workflows',
      [Permission.AUTOMATION_CREATE]: 'Create automation workflows',
      [Permission.AUTOMATION_DELETE]: 'Delete automation workflows',
      [Permission.SETTINGS_READ]: 'View application settings',
      [Permission.SETTINGS_WRITE]: 'Modify application settings',
      [Permission.API_KEY_READ]: 'View API keys',
      [Permission.API_KEY_WRITE]: 'Create and modify API keys',
      [Permission.API_KEY_DELETE]: 'Delete API keys',
      [Permission.TERMINAL_EXECUTE]: 'Execute terminal commands',
      [Permission.BROWSER_CONTROL]: 'Control browser automation',
      [Permission.DATABASE_QUERY]: 'Query databases',
      [Permission.DATABASE_MODIFY]: 'Modify database records',
      [Permission.USER_MANAGE]: 'Manage user accounts',
      [Permission.SYSTEM_CONFIGURE]: 'Configure system settings',
    };

    return descriptions[permission] || 'Unknown permission';
  }
}

export function usePermission(permission: Permission, userRole?: UserRole): boolean {
  if (!userRole) {
    return false;
  }

  return PermissionManager.hasPermission(userRole, permission);
}

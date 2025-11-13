import { UserRole } from '../services/auth';

export enum Permission {
  // File operations
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  FILE_EXECUTE = 'file:execute',

  // Automation
  AUTOMATION_RUN = 'automation:run',
  AUTOMATION_CREATE = 'automation:create',
  AUTOMATION_DELETE = 'automation:delete',

  // Settings
  SETTINGS_READ = 'settings:read',
  SETTINGS_WRITE = 'settings:write',

  // API Keys
  API_KEY_READ = 'api_key:read',
  API_KEY_WRITE = 'api_key:write',
  API_KEY_DELETE = 'api_key:delete',

  // Terminal
  TERMINAL_EXECUTE = 'terminal:execute',

  // Browser
  BROWSER_CONTROL = 'browser:control',

  // Database
  DATABASE_QUERY = 'database:query',
  DATABASE_MODIFY = 'database:modify',

  // Admin
  USER_MANAGE = 'user:manage',
  SYSTEM_CONFIGURE = 'system:configure',
}

// Permission matrix: defines which roles have which permissions
const PERMISSION_MATRIX: Record<UserRole, Permission[]> = {
  [UserRole.Viewer]: [
    Permission.FILE_READ,
    Permission.SETTINGS_READ,
    Permission.API_KEY_READ,
  ],
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
  [UserRole.Admin]: Object.values(Permission), // Admin has all permissions
};

export class PermissionManager {
  /**
   * Check if a user role has a specific permission
   */
  static hasPermission(role: UserRole, permission: Permission): boolean {
    const permissions = PERMISSION_MATRIX[role];
    return permissions.includes(permission);
  }

  /**
   * Check if a user role has all of the specified permissions
   */
  static hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
    return permissions.every((permission) =>
      this.hasPermission(role, permission)
    );
  }

  /**
   * Check if a user role has any of the specified permissions
   */
  static hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
    return permissions.some((permission) =>
      this.hasPermission(role, permission)
    );
  }

  /**
   * Get all permissions for a role
   */
  static getPermissionsForRole(role: UserRole): Permission[] {
    return PERMISSION_MATRIX[role];
  }

  /**
   * Check if operation requires user confirmation
   */
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

  /**
   * Get human-readable description of permission
   */
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

/**
 * React hook for checking permissions (example)
 */
export function usePermission(permission: Permission, userRole?: UserRole): boolean {
  // In a real implementation, this would get the current user's role from context/store
  if (!userRole) {
    return false;
  }

  return PermissionManager.hasPermission(userRole, permission);
}

/**
 * Higher-order component for permission-based rendering
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  permission: Permission
): React.FC<P & { userRole?: UserRole }> {
  return (props: P & { userRole?: UserRole }) => {
    const { userRole, ...restProps } = props;

    if (!userRole || !PermissionManager.hasPermission(userRole, permission)) {
      return null;
    }

    return <Component {...(restProps as P)} />;
  };
}

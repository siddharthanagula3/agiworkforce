import { redirect } from 'next/navigation';

/**
 * /user → /settings alias.
 *
 * The desktop app's update-password flow (apps/desktop cloudAccountAuth.ts)
 * opens `${WEB_APP_URL}/user`, which previously 404ed. Account management
 * lives under /settings.
 */
export default function UserAlias() {
  redirect('/settings');
}

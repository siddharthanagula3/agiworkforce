import { redirect } from 'next/navigation';

/**
 * /settings/profile is now merged into /settings/general.
 * This redirect keeps existing links working.
 */
export default function ProfileRedirect() {
  redirect('/settings/general');
}

import { redirect } from 'next/navigation';

export default function ConnectorPermissionsRedirectPage() {
  redirect('/settings/capabilities');
}

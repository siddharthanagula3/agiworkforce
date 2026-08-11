import { redirect } from 'next/navigation';

// The standalone /customize surface duplicated Settings, so this route is retained
// as a deep link to the real profile/personalization controls. Skills, Plugins, and
// Connectors remain separately labelled sections inside that same modal.
export default function CustomizePage() {
  redirect('/settings/general');
}

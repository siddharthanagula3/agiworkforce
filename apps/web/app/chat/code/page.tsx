import { permanentRedirect } from 'next/navigation';
import { CODE_ROUTES } from '@/features/code/code-surface';

export default function LegacyCodeRoute() {
  permanentRedirect(CODE_ROUTES.root);
}

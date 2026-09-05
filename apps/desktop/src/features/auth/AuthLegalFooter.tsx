import { WEB_APP_URL } from '../../api/config';
import { openExternalUrl } from '../../utils/navigation';
import { AUTH_FOOTER_CLASS, AUTH_FOOTER_LINK_CLASS } from './authStyles';

const POLICY_LINKS = [
  { path: '/terms', label: 'Terms of Use' },
  { path: '/privacy', label: 'Privacy Policy' },
] as const;

export function AuthLegalFooter() {
  return (
    <div className={AUTH_FOOTER_CLASS} data-testid="auth-legal-footer">
      {POLICY_LINKS.map((link, index) => (
        <span key={link.path} className="inline-flex items-center gap-3">
          {index > 0 ? <span aria-hidden="true">|</span> : null}
          <button
            type="button"
            className={AUTH_FOOTER_LINK_CLASS}
            onClick={() => void openExternalUrl(`${WEB_APP_URL}${link.path}`)}
          >
            {link.label}
          </button>
        </span>
      ))}
    </div>
  );
}

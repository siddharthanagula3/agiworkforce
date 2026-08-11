import { AgiMark } from '@agiworkforce/ui';
import { supportsLocalAppMode } from '../../lib/runtimeEnvironment';
import { NativeSignInCard } from './NativeSignInCard';

interface AuthPageProps {
  onAuthSuccess?: () => void;
}

/**
 * Signed-out Cloud gate for Desktop hosts.
 *
 * Mirrors the web app's EMBEDDED auth shell
 * (`apps/web/features/marketing/components/AuthShell.tsx`, the
 * `embedded`/`?surface=desktop` variant): one compact centered column —
 * brand row with a secure-sign-in badge and the sign-in card. Hosts with a
 * Local execution plane also get a one-line Local Mode note; the cloud-only
 * Electron shell must never advertise one. The earlier split layout (42%
 * marketing aside + oversized card) diverged from every other AGI sign-in
 * surface and clipped the card on smaller windows; do not reintroduce it.
 *
 * Scroll behavior: `overflow-y-auto` container + `m-auto` child, NOT flex
 * centering — a card taller than the window must scroll, not clip at both
 * ends.
 */
export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  return (
    <div className="flex h-full min-h-full flex-col bg-background">
      <main className="flex flex-1 overflow-y-auto px-6 py-8" aria-label="AGI Cloud sign-in">
        <div className="m-auto w-full max-w-md">
          <header className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background"
                aria-hidden="true"
              >
                <AgiMark size={20} mono />
              </div>
              <span className="text-base font-semibold tracking-tight text-foreground">
                AGI Desktop
              </span>
            </div>
            {/*
              text-foreground/70, not text-muted-foreground: at 11px on the
              bg-muted/40 pill the muted token renders #64748b on #f8f8f8,
              which is 4.48:1 — below the 4.5:1 WCAG 2.1 AA minimum, and with
              no large-text exemption at this size and weight. The desktop
              accessibility audit fails on it as a serious violation. 70%
              foreground composites to #555a68 for 6.49:1 while staying
              visually muted.
            */}
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground/70">
              Secure Cloud sign-in
            </span>
          </header>

          <NativeSignInCard onSuccess={onAuthSuccess} />

          {supportsLocalAppMode ? (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Local Mode stays available without an account.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default AuthPage;

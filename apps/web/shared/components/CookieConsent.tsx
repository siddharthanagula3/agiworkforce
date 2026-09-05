'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/identity/client';
import { X } from 'lucide-react';
import {
  Switch,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { Label } from '@agiworkforce/ui';
import {
  ALL_ACCEPTED_PREFERENCES,
  COOKIE_CONSENT_OPEN_EVENT,
  NECESSARY_ONLY_PREFERENCES,
  readCookiePreferences,
  writeCookiePreferences,
  type CookiePreferences,
} from '@shared/lib/cookie-consent';

const CLOSE_ICON_SIZE = 16;
const PROMPT_DELAY_MS = 1000;

export const CookieConsent = () => {
  const { isLoaded, isSignedIn } = useSession();
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(NECESSARY_ONLY_PREFERENCES);

  // Consent belongs to the public site: a signed-in visitor is inside the
  // product, not deciding whether to use it, so the unsolicited banner never
  // opens there the way it never does on chatgpt.com or claude.ai. The
  // explicit "Change your cookie preferences" control on /cookies is
  // untouched by this, it opens `showSettings` directly regardless of
  // sign-in state, since that is a deliberate visit, not an interruption.
  useEffect(() => {
    if (!isLoaded || isSignedIn) {
      setShowBanner(false);
      return undefined;
    }

    const stored = readCookiePreferences();
    if (stored) {
      setPreferences(stored);
      return undefined;
    }

    const timer = setTimeout(() => setShowBanner(true), PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const openSettings = () => {
      setPreferences(readCookiePreferences() ?? NECESSARY_ONLY_PREFERENCES);
      setShowSettings(true);
    };
    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings);
  }, []);

  const savePreferences = useCallback((prefs: CookiePreferences) => {
    setPreferences(prefs);
    setShowBanner(false);
    setShowSettings(false);
    writeCookiePreferences(prefs);
  }, []);

  // Published so surfaces pinned to the bottom can clear the banner instead of
  // sitting under it. The composer was the case that mattered: its stop button
  // landed inside the banner's card and every click hit "Necessary only".
  const bannerRef = useRef<HTMLDivElement | null>(null);

  // The banner is `position: fixed; bottom: 0`, so it overlays whatever a
  // normal-flow page has at the viewport bottom on first visit instead of
  // making room for itself. The fixed chat/support shells clear it via the
  // `--agi-consent-inset` var below; the body padding gives normal-flow
  // pages the same room to scroll past their true end so a footer is never
  // permanently stuck under the bar. Content already on screen when the
  // banner opens is deliberately left alone rather than scrolled out from
  // under it: an unrequested scroll on mount is worse than a card briefly
  // sitting over a card it did not ask to move.
  useEffect(() => {
    const root = document.documentElement;
    const { body } = document;
    if (!showBanner) {
      root.style.removeProperty('--agi-consent-inset');
      body.style.removeProperty('padding-bottom');
      return;
    }
    const publish = () => {
      const height = bannerRef.current?.getBoundingClientRect().height ?? 0;
      const inset = `${Math.round(height)}px`;
      root.style.setProperty('--agi-consent-inset', inset);
      body.style.paddingBottom = inset;
    };
    publish();
    const node = bannerRef.current;
    const observer = node ? new ResizeObserver(publish) : null;
    if (node && observer) observer.observe(node);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--agi-consent-inset');
      body.style.removeProperty('padding-bottom');
    };
  }, [showBanner]);

  return (
    <>
      {showBanner && (
        // The band spans the viewport so the panel can centre in it, but only
        // the panel may take pointer events: the empty half of the band sat
        // over the sidebar and swallowed clicks on the account menu.
        <div
          ref={bannerRef}
          data-design="agi"
          className="agi-ds-consent agi-modal-scope"
          role="region"
          aria-label="Cookie consent"
        >
          <div className="agi-ds-consent-panel">
            <div className="agi-ds-consent-text">
              <h3 className="agi-ds-consent-title">Cookies on this site</h3>
              <p className="agi-ds-consent-copy">
                Analytics is off until you allow it, and the{' '}
                <Link href="/cookies" data-inline-link="true" className="agi-ds-consent-link">
                  cookie policy
                </Link>{' '}
                lists everything else this site sets.
              </p>
            </div>

            <div className="agi-ds-consent-actions">
              <button
                type="button"
                className="agi-ds-btn"
                data-variant="primary"
                onClick={() => savePreferences(NECESSARY_ONLY_PREFERENCES)}
              >
                Necessary only
              </button>
              <button
                type="button"
                className="agi-ds-btn"
                data-variant="secondary"
                onClick={() => savePreferences(ALL_ACCEPTED_PREFERENCES)}
              >
                Allow analytics
              </button>
              <button
                type="button"
                className="agi-ds-btn"
                data-variant="secondary"
                onClick={() => setShowSettings(true)}
              >
                Customise
              </button>
            </div>

            {/* Closing is a refusal, never a grant: consent may not be
                inferred from dismissal, so this may only ever write
                NECESSARY_ONLY_PREFERENCES. It has to write something;
                hiding the banner without recording anything left every
                reload re-prompting the same person forever, which is the
                pressure tactic the opt-in is supposed to avoid. Users
                change their mind through the /cookies preferences button. */}
            <button
              type="button"
              className="agi-ds-consent-close"
              onClick={() => savePreferences(NECESSARY_ONLY_PREFERENCES)}
              aria-label="Close and reject non-essential cookies"
            >
              <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              These are the only cookie categories this site uses. See the{' '}
              <Link
                href="/cookies"
                data-inline-link="true"
                className="underline underline-offset-2"
              >
                cookie policy
              </Link>{' '}
              for what each one covers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between space-x-2">
              <div className="flex-1">
                <Label className="font-medium">Necessary</Label>
                <p className="text-sm text-muted-foreground">
                  Auth session, CSRF token and locale. Required for the site to work, so this cannot
                  be switched off.
                </p>
              </div>
              <Switch checked disabled aria-label="Necessary cookies (always on)" />
            </div>

            <div className="flex items-center justify-between space-x-2">
              <div className="flex-1">
                <Label className="font-medium" htmlFor="cookie-analytics">
                  Analytics
                </Label>
                <p className="text-sm text-muted-foreground">
                  Aggregated page views (Google Analytics 4), with no personally identifying
                  information. Off by default.
                </p>
              </div>
              <Switch
                id="cookie-analytics"
                checked={preferences.analytics}
                onCheckedChange={(checked) =>
                  setPreferences({ necessary: true, analytics: checked })
                }
                aria-label="Analytics cookies"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button onClick={() => savePreferences(preferences)}>Save preferences</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

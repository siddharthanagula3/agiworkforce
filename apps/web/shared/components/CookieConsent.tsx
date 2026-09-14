'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Cookie, X } from 'lucide-react';
import { useSession } from '@/lib/identity/client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
} from '@agiworkforce/ui';
import {
  ALL_ACCEPTED_PREFERENCES,
  COOKIE_CONSENT_OPEN_EVENT,
  NECESSARY_ONLY_PREFERENCES,
  readCookiePreferences,
  writeCookiePreferences,
  type CookiePreferences,
} from '@shared/lib/cookie-consent';

const CLOSE_ICON_SIZE = 16;
const COOKIE_ICON_SIZE = 20;
const PROMPT_DELAY_MS = 1000;

export const CookieConsent = () => {
  const { isLoaded, isSignedIn } = useSession();
  const reducedMotion = useReducedMotion();
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(NECESSARY_ONLY_PREFERENCES);
  const bannerRef = useRef<HTMLDivElement | null>(null);

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
      <AnimatePresence>
        {showBanner && (
          <motion.div
            ref={bannerRef}
            initial={reducedMotion ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-start sm:p-6"
            role="region"
            aria-label="Cookie consent"
          >
            <div className="pointer-events-auto relative w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-lg">
              <div className="flex items-start gap-3 pr-8">
                <Cookie
                  size={COOKIE_ICON_SIZE}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-sm font-semibold leading-5">Cookies on this site</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Cookies that keep you signed in are always on. Analytics stays off until you
                    allow it, and we never set advertising cookies. Read the{' '}
                    <Link
                      href="/cookies"
                      data-inline-link="true"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      cookie policy
                    </Link>
                    .
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  data-variant="primary"
                  className="bg-foreground text-background hover:bg-foreground/90"
                  onClick={() => savePreferences(NECESSARY_ONLY_PREFERENCES)}
                >
                  Necessary only
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-variant="secondary"
                  onClick={() => savePreferences(ALL_ACCEPTED_PREFERENCES)}
                >
                  Allow analytics
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-variant="secondary"
                  onClick={() => setShowSettings(true)}
                >
                  Customise
                </Button>
              </div>
              <button
                type="button"
                onClick={() => savePreferences(NECESSARY_ONLY_PREFERENCES)}
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close and reject non-essential cookies"
              >
                <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

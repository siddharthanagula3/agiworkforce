'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Cookie, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

export const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(NECESSARY_ONLY_PREFERENCES);

  useEffect(() => {
    const stored = readCookiePreferences();
    if (stored) {
      setPreferences(stored);
      return undefined;
    }

    const timer = setTimeout(() => setShowBanner(true), 1000);
    return () => clearTimeout(timer);
  }, []);

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

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
            role="region"
            aria-label="Cookie consent"
          >
            {/* The wrapper spans the full width but the card is centred at
                max-w-7xl, so its empty padding sat over the sidebar and
                swallowed clicks on the account menu until the banner was
                dismissed. Only the card itself should take pointer events. */}
            <div className="pointer-events-none mx-auto max-w-7xl">
              <div className="pointer-events-auto relative rounded-lg border bg-card p-3 shadow-2xl backdrop-blur-sm sm:p-4 md:p-6">
                <button
                  onClick={() => setShowBanner(false)}
                  className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
                  aria-label="Ask me later"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                  <div className="flex flex-1 items-start gap-3">
                    <Cookie className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
                    <div>
                      <h3 className="mb-1 font-semibold">We value your privacy</h3>
                      <p className="pr-10 text-sm text-muted-foreground">
                        Cookies that keep you signed in are always on. Analytics is off until you
                        turn it on, and we never set advertising cookies. Read the{' '}
                        <Link
                          href="/cookies"
                          data-inline-link="true"
                          className="underline underline-offset-2"
                        >
                          cookie policy
                        </Link>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 md:flex-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSettings(true)}
                      className="gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Customize
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => savePreferences(NECESSARY_ONLY_PREFERENCES)}
                    >
                      Necessary only
                    </Button>
                    <Button size="sm" onClick={() => savePreferences(ALL_ACCEPTED_PREFERENCES)}>
                      Allow analytics
                    </Button>
                  </div>
                </div>
              </div>
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

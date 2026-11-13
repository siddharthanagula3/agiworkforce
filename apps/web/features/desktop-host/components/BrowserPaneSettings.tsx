'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { browserSiteHost, type BrowserSites } from '@agiworkforce/local-runtime-contract';
import { useConfirmAction } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import {
  blockBrowserSite,
  browserPaneSupported,
  clearBrowserPaneData,
  readBrowserSites,
  removeBrowserSite,
} from '../lib/runtime-client';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsEmpty,
  DesktopSettingsGroup,
  DesktopSettingsHeading,
  DesktopSettingsRow,
} from './DesktopSettingsRow';

const HEADING = 'Browser';
const HEADING_HINT =
  'The browser pane in coding sessions. It keeps its own cookies and has no access to your account, files, camera or microphone.';
const ALLOWED_HEADING = 'Allowed sites';
const ALLOWED_HINT =
  'Sites you allowed when the browser asked. Pages on this computer always open.';
const BLOCKED_HEADING = 'Blocked sites';
const BLOCKED_HINT = 'Never opened in the browser pane, even if allowed.';
const NO_ALLOWED = 'None yet. The browser asks before opening a site for the first time.';
const NO_BLOCKED = 'None.';
const REMOVE_LABEL = 'Remove';
const BLOCK_LABEL = 'Block';
const BLOCK_FIELD = 'Site to block';
const BLOCK_PLACEHOLDER = 'example.com';
const BLOCK_INVALID = 'Enter a site name such as example.com.';
const DATA_HEADING = 'Browsing data';
const CLEAR_LABEL = 'Clear browsing data';
const CLEAR_HINT = 'Cookies, saved sign-ins and site storage in the browser pane.';
const CLEAR_TITLE = 'Clear browsing data?';
const CLEAR_DESCRIPTION =
  'Cookies, sign-ins and data that sites saved in the browser pane are deleted and cannot be recovered. You will be signed out of every site you used there. Your account and Chrome are not affected.';
const CLEARED = 'Browsing data cleared.';
const LOAD_FAILED = 'The site lists could not be read.';
const SAVE_FAILED = 'That change could not be saved.';

export function BrowserPaneSettings() {
  const host = useElectronHost();
  const fieldId = useId();
  const { confirm, dialog } = useConfirmAction();
  const [supported, setSupported] = useState(false);
  const [sites, setSites] = useState<BrowserSites | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<{ text: string; failure: boolean } | null>(null);

  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    void browserPaneSupported().then(async (ok) => {
      if (cancelled) return;
      setSupported(ok);
      if (!ok) return;
      try {
        const read = await readBrowserSites();
        if (!cancelled) setSites(read);
      } catch (cause: unknown) {
        if (!cancelled) setMessage({ text: toUserMessage(cause, LOAD_FAILED), failure: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [host]);

  const change = useCallback(async (work: () => Promise<BrowserSites>) => {
    setMessage(null);
    try {
      setSites(await work());
    } catch (cause: unknown) {
      setMessage({ text: toUserMessage(cause, SAVE_FAILED), failure: true });
    }
  }, []);

  if (!host || !supported) return null;

  const block = (event: FormEvent) => {
    event.preventDefault();
    const site = browserSiteHost(draft);
    if (!site) {
      setMessage({ text: BLOCK_INVALID, failure: true });
      return;
    }
    setDraft('');
    void change(() => blockBrowserSite(site));
  };

  const askToClear = () =>
    confirm({
      title: CLEAR_TITLE,
      description: CLEAR_DESCRIPTION,
      confirmLabel: 'Clear',
      destructive: true,
      onConfirm: async () => {
        try {
          await clearBrowserPaneData();
          setMessage({ text: CLEARED, failure: false });
        } catch (cause: unknown) {
          setMessage({ text: toUserMessage(cause, SAVE_FAILED), failure: true });
        }
      },
    });

  return (
    <div className="flex flex-col gap-6">
      <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />

      <DesktopSettingsGroup title={ALLOWED_HEADING} hint={ALLOWED_HINT}>
        {sites && sites.allowed.length === 0 && (
          <DesktopSettingsEmpty>{NO_ALLOWED}</DesktopSettingsEmpty>
        )}
        {sites?.allowed.map((site) => (
          <DesktopSettingsRow key={site} label={site} hint="">
            <button
              type="button"
              className={DESKTOP_SETTINGS_BUTTON_CLASS}
              onClick={() => void change(() => removeBrowserSite(site))}
            >
              {REMOVE_LABEL}
            </button>
          </DesktopSettingsRow>
        ))}
      </DesktopSettingsGroup>

      <DesktopSettingsGroup title={BLOCKED_HEADING} hint={BLOCKED_HINT}>
        <form className="flex flex-wrap items-end gap-2 py-3" onSubmit={block}>
          <label htmlFor={fieldId} className="sr-only">
            {BLOCK_FIELD}
          </label>
          <input
            id={fieldId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={BLOCK_PLACEHOLDER}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2.5 text-sm text-[var(--text-1)]"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className={DESKTOP_SETTINGS_BUTTON_CLASS}
            disabled={draft.trim() === ''}
          >
            {BLOCK_LABEL}
          </button>
        </form>
        {sites && sites.blocked.length === 0 && (
          <DesktopSettingsEmpty>{NO_BLOCKED}</DesktopSettingsEmpty>
        )}
        {sites?.blocked.map((site) => (
          <DesktopSettingsRow key={site} label={site} hint="">
            <button
              type="button"
              className={DESKTOP_SETTINGS_BUTTON_CLASS}
              onClick={() => void change(() => removeBrowserSite(site))}
            >
              {REMOVE_LABEL}
            </button>
          </DesktopSettingsRow>
        ))}
      </DesktopSettingsGroup>

      <DesktopSettingsGroup title={DATA_HEADING}>
        <DesktopSettingsRow label={CLEAR_LABEL} hint={CLEAR_HINT}>
          <button type="button" className={DESKTOP_SETTINGS_BUTTON_CLASS} onClick={askToClear}>
            {CLEAR_LABEL}
          </button>
        </DesktopSettingsRow>
      </DesktopSettingsGroup>

      {message !== null && (
        <p
          className={
            message.failure
              ? 'text-sm text-[var(--settings-destructive-text)]'
              : 'text-sm text-[var(--text-3)]'
          }
          role={message.failure ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      {dialog}
    </div>
  );
}

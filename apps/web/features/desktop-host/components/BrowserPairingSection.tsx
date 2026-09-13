'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DesktopRuntimeError,
  getHostBridge,
  type BrowserPairingState,
} from '@agiworkforce/local-runtime-contract';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { useDesktopHost } from '../lib/host';
import { installBrowserHost, readBrowserPairing, unpairBrowser } from '../lib/runtime-client';

const HEADING = 'Chrome';
const INTRO =
  'Pair the AGI Workforce extension with this Mac and AGI can read the page you are on, click, type, open addresses, screenshot, and read the console, network and downloads, from chat. Chrome still only acts on sites you approved in the extension, and every action asks you first.';
const HOW_TO_PAIR =
  'In Chrome, open the AGI Workforce side panel, choose Connect to Desktop, and type the code this app shows you.';
const NO_EXTENSION =
  'Nothing has asked to pair yet. Install the AGI Workforce extension in Chrome, then start pairing from its side panel.';
const HOST_MISSING =
  'The browser host is not registered, so Chrome cannot reach this app. Register it again below.';
const LOAD_FAILED = 'The pairing state could not be read.';
const INSTALL_FAILED = 'The browser host was not registered.';
const UNPAIR_FAILED = 'The browser was not unpaired.';

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const CODE_CLASS =
  'inline-flex min-h-[36px] items-center rounded-md border border-border/60 bg-muted/40 px-3 font-mono text-base tracking-[0.35em] text-foreground';

function messageFor(error: unknown, fallback: string): string | null {
  if (error instanceof DesktopRuntimeError) {
    return error.code === 'cancelled' ? null : `${fallback} ${error.message}`;
  }
  return fallback;
}

/**
 * Pairing lives here rather than in the composer because it is a standing
 * relationship between this Mac and one browser: the code is shown by the app,
 * typed into Chrome, and can be withdrawn from the same row.
 */
export function BrowserPairingSection() {
  const host = useDesktopHost();
  const [state, setState] = useState<BrowserPairingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const refresh = useCallback(async () => {
    try {
      setState(await readBrowserPairing());
      setError(null);
    } catch (cause) {
      setError(messageFor(cause, LOAD_FAILED));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!host) {
      setLoading(false);
      return undefined;
    }
    void refresh();
    const bridge = getHostBridge();
    return bridge?.onRuntimeEvent((event) => {
      if (event.kind === 'browser-pairing-changed') setState(event.state);
    });
  }, [host, refresh]);

  const onRegisterHost = useCallback(async () => {
    setBusy(true);
    try {
      await installBrowserHost();
      await refresh();
    } catch (cause) {
      setError(messageFor(cause, INSTALL_FAILED));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const onUnpair = useCallback(() => {
    confirm({
      title: 'Unpair this browser?',
      description:
        'Chrome stops answering this Mac and the browser host is removed, so anything running through the pairing stops. Nothing in Chrome is deleted, and you can pair again from the extension.',
      confirmLabel: 'Unpair',
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          setState(await unpairBrowser());
          setError(null);
        } catch (cause) {
          setError(messageFor(cause, UNPAIR_FAILED));
        } finally {
          setBusy(false);
        }
      },
    });
  }, [confirm]);

  if (!host) return null;

  return (
    <section className="flex flex-col gap-2" aria-label={HEADING}>
      <h3 className="text-sm font-medium text-foreground">{HEADING}</h3>
      <p className="text-xs text-muted-foreground">{INTRO}</p>

      {loading ? <Spinner aria-label="Loading pairing state" /> : null}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {state?.pendingRequest ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground">{HOW_TO_PAIR}</p>
          <span className={CODE_CLASS} aria-label="Pairing code">
            {state.pendingRequest.code}
          </span>
        </div>
      ) : null}

      {state && !state.paired && !state.pendingRequest ? (
        <p className="text-xs text-muted-foreground">{NO_EXTENSION}</p>
      ) : null}

      {state?.paired ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground" aria-live="polite">
            {state.connected ? 'Paired and answering' : 'Paired, not answering right now'}
            {state.fingerprint ? ` · ${state.fingerprint}` : ''}
          </p>
          {!state.hostInstalled ? (
            <p className="text-xs text-muted-foreground">{HOST_MISSING}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={busy}
              onClick={() => void onRegisterHost()}
            >
              Register the browser host again
            </button>
            <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={onUnpair}>
              Unpair
            </button>
          </div>
        </div>
      ) : null}

      {state && !state.bridgeListening ? (
        <p className="text-xs text-muted-foreground">
          The local pairing bridge is not listening, so Chrome cannot reach this app. Quit and
          reopen AGI Cloud.
        </p>
      ) : null}

      {confirmDialog}
    </section>
  );
}

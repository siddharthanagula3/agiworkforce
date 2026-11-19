'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import {
  invalidatePreferencesSnapshot,
  type PreferenceOwner,
} from '@/app/settings/_lib/preferences-client';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { usePreferenceOwner, usePreferenceView } from '../hooks/use-preference-owner';
import { DEVICE_SIGNIN_SETTING_KEY as KEY } from '../lib/device-signin-preferences';
import {
  readDevicePreferences,
  saveDevicePreference,
  type DevicePreferenceSnapshot,
} from '../services/device-preferences-client';

const UNCERTAIN =
  'We could not confirm whether your change was saved. Refreshing only shows the setting observed now; an earlier change may still finish. Review it before allowing another change.';
type View = {
  generation: object;
  snapshot: DevicePreferenceSnapshot | null;
  busy: boolean;
  reviewed: boolean;
  error: string | null;
};

export function DeviceSignInToggle({ active = true }: { active?: boolean }) {
  const owner = usePreferenceOwner();
  const capture = usePreferenceView(owner);
  const uncertain = useRef<PreferenceOwner | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [, redraw] = useState(0);
  const admission = useRef<object | null>(null);
  const lane = useMemo(() => {
    const identity = {};
    let generation: object | null = null;
    let viewCurrent = () => false;
    let snapshot: View | null = null;
    let operation: RequestAuthority | null = null;
    const current = (captured: object | null) =>
      captured !== null &&
      generation === captured &&
      active &&
      admission.current === identity &&
      owner?.isCurrent() === true &&
      viewCurrent();
    const reconcile = () => {
      if (
        generation === null ||
        admission.current !== identity ||
        !active ||
        !owner ||
        owner.isCurrent()
      )
        return;
      generation = null;
      operation?.retire();
      operation = null;
      snapshot = null;
      setView(null);
      redraw((revision) => revision + 1);
    };
    const publish = (captured: object, patch: Partial<View>) => {
      if (!current(captured) || !snapshot) return;
      snapshot = { ...snapshot, ...patch };
      setView(snapshot);
    };
    const admits = (rendered: View | null): rendered is View =>
      rendered !== null && rendered === snapshot && current(rendered.generation);
    const read = async (captured: object) => {
      if (!owner || !current(captured) || operation) return;
      const request = createRequestAuthority(
        owner.session,
        () => current(captured) && operation === request,
      );
      operation = request;
      publish(captured, { busy: true, error: null });
      try {
        const result = await readDevicePreferences(request);
        request.assertCurrent();
        publish(captured, { snapshot: result, busy: false, reviewed: uncertain.current === owner });
      } catch {
        if (request.isCurrent())
          publish(captured, {
            snapshot: null,
            busy: false,
            error: 'Your device sign-in setting is unknown. Retry loading it.',
          });
      } finally {
        reconcile();
        if (operation === request) operation = null;
        request.retire();
      }
    };
    return {
      identity,
      displays: admits,
      setup: () => {
        const captured = {};
        generation = captured;
        viewCurrent = capture();
        snapshot = {
          generation: captured,
          snapshot: null,
          busy: true,
          reviewed: false,
          error: null,
        };
        if (current(captured)) {
          setView(snapshot);
          void read(captured);
        }
        const unsubscribe = owner?.session.subscribe?.(reconcile);
        reconcile();
        return () => {
          unsubscribe?.();
          if (generation !== captured) return;
          generation = null;
          operation?.retire();
          operation = null;
          snapshot = null;
        };
      },
      refresh: (rendered: View | null) => {
        reconcile();
        if (admits(rendered)) void read(rendered.generation);
      },
      acknowledge: (rendered: View | null) => {
        reconcile();
        if (
          !admits(rendered) ||
          operation ||
          !rendered.snapshot ||
          !rendered.reviewed ||
          uncertain.current !== owner
        )
          return;
        uncertain.current = null;
        publish(rendered.generation, { error: null });
      },
      save: async (rendered: View | null, enabled: boolean) => {
        reconcile();
        if (
          !owner ||
          !admits(rendered) ||
          !rendered.snapshot ||
          operation ||
          uncertain.current === owner ||
          (rendered.snapshot.stored[KEY] !== false) === enabled
        )
          return;
        const captured = rendered.generation;
        let dispatched = false;
        const request = createRequestAuthority(
          owner.session,
          () => current(captured) && operation === request,
          () => {
            dispatched = true;
            uncertain.current = owner;
            invalidatePreferencesSnapshot();
          },
        );
        operation = request;
        publish(captured, { busy: true, reviewed: false, error: null });
        try {
          const result = await saveDevicePreference(request, enabled);
          request.assertCurrent();
          uncertain.current = null;
          publish(captured, { snapshot: result, busy: false });
        } catch {
          if (request.isCurrent() && dispatched) invalidatePreferencesSnapshot();
          if (request.isCurrent())
            publish(captured, {
              busy: false,
              error: dispatched ? null : 'Your change was not sent. Try again.',
            });
        } finally {
          reconcile();
          if (operation === request) operation = null;
          request.retire();
        }
      },
    };
  }, [owner, active, capture]);
  admission.current = lane.identity;
  if (uncertain.current && !uncertain.current.isCurrent()) uncertain.current = null;
  useLayoutEffect(() => lane.setup(), [lane]);
  const displayed = lane.displays(view) ? view : null;
  const loaded = displayed?.snapshot !== null && displayed?.snapshot !== undefined;
  const enabled = displayed?.snapshot ? displayed.snapshot.stored[KEY] !== false : false;
  const saving = displayed?.busy === true;
  const blocked = owner !== null && uncertain.current === owner;
  const error = displayed?.error;
  if (!active) return null;
  return (
    <section
      aria-label="Device sign-in"
      aria-busy={saving}
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: 'var(--space-4) var(--space-5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-2)',
              marginBottom: 'var(--space-1)',
            }}
          >
            Approve sign-in from a device code
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
            Lets apps sign in with a code you approve here. Only approve codes you started. Off
            keeps existing devices signed in.
          </p>
        </div>
        <Switch
          checked={enabled}
          aria-label="Approve sign-in from a device code"
          disabled={!loaded || saving || blocked}
          onCheckedChange={(checked) => void lane.save(displayed, checked)}
        />
      </div>
      {!owner ? <p role="status">Sign in to manage device sign-in.</p> : null}
      {owner && !loaded && !saving && !error ? (
        <p role="status">Your device sign-in setting is unknown.</p>
      ) : null}
      {saving ? <p role="status">Loading or saving your device sign-in setting…</p> : null}
      {blocked ? <p role="alert">{UNCERTAIN}</p> : null}
      {blocked && loaded ? (
        <p role="status">
          {displayed?.reviewed ? 'Last observed setting' : 'Last confirmed setting'}:{' '}
          {enabled ? 'on' : 'off'}.
        </p>
      ) : null}
      {owner && !saving && (!loaded || blocked) ? (
        <button
          type="button"
          onClick={() => lane.refresh(displayed)}
          className="mt-2 text-sm underline underline-offset-4"
        >
          Refresh setting
        </button>
      ) : null}
      {blocked && loaded && displayed?.reviewed && !saving ? (
        <button
          type="button"
          onClick={() => lane.acknowledge(displayed)}
          className="mt-2 text-sm underline underline-offset-4"
        >
          I understand; allow another change
        </button>
      ) : null}
      {error ? (
        <p
          role="alert"
          style={{
            margin: 'var(--space-2) 0 0',
            fontSize: 12,
            color: 'var(--settings-destructive-text)',
          }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

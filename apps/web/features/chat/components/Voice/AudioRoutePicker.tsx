'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Check, Volume2 } from '@agiworkforce/icons';
import { useMenuKeyboard } from '@agiworkforce/ui';

import { cn } from '@shared/lib/utils';

const LABEL = {
  trigger: 'Audio output',
  menu: 'Audio output device',
  systemDefault: 'System default',
  unnamed: 'Audio output',
} as const;

const SYSTEM_DEFAULT_ID = 'default';

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

function audioOutputSwitchingSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

/**
 * A browser hides output labels until some device has been granted, so an
 * unlabelled entry keeps its id rather than being dropped from the list.
 */
export function useAudioOutputDevices(): AudioOutputDevice[] {
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);

  useEffect(() => {
    if (!audioOutputSwitchingSupported()) return;
    let cancelled = false;

    const read = () => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((found) => {
          if (cancelled) return;
          setDevices(
            found
              .filter((device) => device.kind === 'audiooutput')
              .map((device) => ({
                deviceId: device.deviceId,
                label:
                  device.label ||
                  (device.deviceId === SYSTEM_DEFAULT_ID ? LABEL.systemDefault : LABEL.unnamed),
              })),
          );
        })
        .catch(() => undefined);
    };

    read();
    navigator.mediaDevices.addEventListener?.('devicechange', read);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', read);
    };
  }, []);

  return devices;
}

export interface AudioRoutePickerProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  className?: string;
}

export function AudioRoutePicker({ audioRef, className }: AudioRoutePickerProps) {
  const devices = useAudioOutputDevices();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(SYSTEM_DEFAULT_ID);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });

  const select = useCallback(
    (deviceId: string) => {
      const element = audioRef.current as (HTMLAudioElement & { setSinkId?: unknown }) | null;
      const setSinkId = element?.setSinkId;
      if (typeof setSinkId === 'function') {
        void (setSinkId as (id: string) => Promise<void>).call(element, deviceId).then(
          () => setActiveId(deviceId),
          () => undefined,
        );
      }
      setOpen(false);
      triggerRef.current?.focus();
    },
    [audioRef],
  );

  if (devices.length < 2) return null;

  const active = devices.find((device) => device.deviceId === activeId);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${LABEL.trigger}, ${active?.label ?? LABEL.systemDefault}`}
        data-testid="voice-audio-route-trigger"
        className={cn(
          'flex h-9 min-w-9 shrink-0 touch-manipulation items-center gap-2 rounded-full px-3',
          'text-sm text-[var(--chat-text-secondary)] transition-colors',
          'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
        )}
      >
        <Volume2 aria-hidden className="h-4 w-4" />
        <span className="hidden max-w-40 truncate sm:inline">
          {active?.label ?? LABEL.systemDefault}
        </span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label={LABEL.menu}
          data-testid="voice-audio-route-menu"
          className={cn(
            'absolute bottom-full z-[var(--z-dropdown)] mb-2 min-w-56 overflow-hidden rounded-xl p-1',
            'border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] shadow-lg',
          )}
        >
          {devices.map((device) => {
            const selected = device.deviceId === activeId;
            return (
              <button
                key={device.deviceId}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => select(device.deviceId)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm',
                  'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
                )}
              >
                <span className="truncate">{device.label}</span>
                {selected ? <Check aria-hidden className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

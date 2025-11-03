import { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createPortal } from 'react-dom';
import { ActionOverlay, type ClickEffect, type TypingEffect } from './ActionOverlay';
import { ScreenshotOverlay, type RegionEffect } from './ScreenshotOverlay';

type OverlayAnimation =
  | { type: 'click'; x: number; y: number; button: string }
  | { type: 'type'; x: number; y: number; text: string }
  | { type: 'region_highlight'; x: number; y: number; width: number; height: number }
  | { type: 'screenshot_flash' };

const CLICK_DURATION = 380;
const TYPING_DURATION = 900;
const REGION_DURATION = 1200;
const FLASH_DURATION = 220;

const makeId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export function VisualizationLayer() {
  const [clicks, setClicks] = useState<ClickEffect[]>([]);
  const [typing, setTyping] = useState<TypingEffect | null>(null);
  const [region, setRegion] = useState<RegionEffect | null>(null);
  const [flash, setFlash] = useState(false);

  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const regionTimer = useRef<ReturnType<typeof setTimeout>>();
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let active = true;
    let unlisten: UnlistenFn | undefined;

    const init = async () => {
      unlisten = await listen<OverlayAnimation>('overlay://event', (event) => {
        if (!active || !event.payload) {
          return;
        }
        const payload = event.payload;
        switch (payload.type) {
          case 'click': {
            const id = makeId();
            setClicks((prev) => [...prev, { id, x: payload.x, y: payload.y, button: payload.button ?? 'left' }]);
            setTimeout(() => {
              setClicks((prev) => prev.filter((effect) => effect.id !== id));
            }, CLICK_DURATION);
            break;
          }
          case 'type': {
            const id = makeId();
            setTyping({
              id,
              x: payload.x,
              y: payload.y,
              text: payload.text.length > 48 ? `${payload.text.slice(0, 45)}…` : payload.text,
            });
            if (typingTimer.current) {
              clearTimeout(typingTimer.current);
            }
            typingTimer.current = setTimeout(() => setTyping(null), TYPING_DURATION);
            break;
          }
          case 'region_highlight': {
            const id = makeId();
            setRegion({
              id,
              x: payload.x,
              y: payload.y,
              width: payload.width,
              height: payload.height,
            });
            if (regionTimer.current) {
              clearTimeout(regionTimer.current);
            }
            regionTimer.current = setTimeout(() => setRegion(null), REGION_DURATION);
            break;
          }
          case 'screenshot_flash': {
            setFlash(true);
            if (flashTimer.current) {
              clearTimeout(flashTimer.current);
            }
            flashTimer.current = setTimeout(() => setFlash(false), FLASH_DURATION);
            break;
          }
          default:
            break;
        }
      });
    };

    void init();

    return () => {
      active = false;
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      if (regionTimer.current) {
        clearTimeout(regionTimer.current);
      }
      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
      }
      if (unlisten) {
        void unlisten();
      }
    };
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      <ActionOverlay clicks={clicks} typing={typing} />
      <ScreenshotOverlay region={region} flash={flash} />
    </>,
    document.body
  );
}

'use client';

import { useTheme } from 'next-themes';
import { ExternalLink } from '@agiworkforce/icons';
import type { AnswerUiMapBlock } from '@agiworkforce/types';
import { LeafletMapCanvas, type MapPoint } from '../map/LeafletMapCanvas';
import { mapTileStyle, useMapTileConfig } from '../map/mapTileConfig';

export const ANSWER_UI_MAP_HEIGHT_PX = 300;
export const ANSWER_UI_MAP_NOTE = 'Pins are placed from the answer and can be approximate.';
const NEW_TAB_HINT = '(opens in a new tab)';

export interface AnswerUiMapProps {
  block: AnswerUiMapBlock;
}

export function AnswerUiMap({ block }: AnswerUiMapProps) {
  const tileState = useMapTileConfig();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const points: MapPoint[] = block.pins.map((pin) => ({
    key: pin.id,
    latitude: pin.latitude,
    longitude: pin.longitude,
  }));

  return (
    <section
      aria-label={block.title}
      data-testid="answer-ui-map"
      className="min-w-0 overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]"
    >
      <p className="px-4 pb-2 pt-3 text-sm font-semibold text-[color:var(--chat-text-primary)]">
        {block.title}
      </p>
      {tileState.status === 'ready' ? (
        <div className="relative">
          <LeafletMapCanvas
            points={points}
            tile={tileState.config}
            dark={dark}
            label={`Map: ${block.title}`}
            focusKey={null}
            animate={false}
            fullscreenable
            className="w-full"
            style={{ height: ANSWER_UI_MAP_HEIGHT_PX }}
            renderPoint={(point) => {
              const index = block.pins.findIndex((pin) => pin.id === point.key);
              const pin = block.pins[index];
              return (
                <span
                  title={pin?.label}
                  className="grid size-6 place-items-center rounded-full bg-[var(--chat-accent-primary)] text-xs font-semibold text-[color:var(--chat-accent-on-primary)] shadow-e2 ring-2 ring-[var(--chat-surface-elevated)]"
                >
                  {index + 1}
                </span>
              );
            }}
          >
            <span className="pointer-events-none absolute bottom-1 end-1 z-[var(--z-panel-backdrop)] rounded-compact bg-[var(--chat-surface-overlay)] px-1.5 py-0.5 text-xs text-[color:var(--chat-text-secondary)]">
              {mapTileStyle(tileState.config, dark).attribution}
            </span>
          </LeafletMapCanvas>
        </div>
      ) : null}
      <ol className="flex flex-col divide-y divide-[var(--chat-border-subtle)]">
        {block.pins.map((pin, index) => (
          <li key={pin.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--chat-accent-primary)] text-xs font-semibold text-[color:var(--chat-accent-on-primary)]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium text-[color:var(--chat-text-primary)]">
                {pin.label}
              </span>
              {pin.note ? (
                <span className="block break-words text-sm text-[color:var(--chat-text-secondary)]">
                  {pin.note}
                </span>
              ) : null}
            </span>
            <a
              href={pin.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-[color:var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[color:var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="sr-only">
                Open {pin.label} in Maps {NEW_TAB_HINT}
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                Maps
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="px-4 pb-3 pt-1 text-xs text-[color:var(--chat-text-muted)]">
        {ANSWER_UI_MAP_NOTE}
      </p>
    </section>
  );
}

export default AnswerUiMap;

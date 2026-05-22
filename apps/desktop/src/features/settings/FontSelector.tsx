/**
 * FontSelector — "Chat Font" section for GeneralSettings / Appearance tab.
 *
 * Renders 4 clickable "Aa" tiles. Selected tile gets a blue border and a
 * Check icon overlay. Unselected tiles have a subtle border that brightens on
 * hover. Font selection is persisted in settingsStore.windowPreferences.chatFont
 * and applied immediately via the --chat-font-family CSS variable.
 */
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSettingsStore, selectChatFont } from '../../stores/settingsStore';
import type { ChatFont } from '../../stores/settingsStore';

interface FontTile {
  id: ChatFont;
  label: string;
  fontFamily: string;
}

const FONT_TILES: FontTile[] = [
  {
    id: 'default',
    label: 'Default',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'sans',
    label: 'Sans',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  {
    id: 'mono',
    label: 'Mono',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  {
    id: 'dyslexic',
    label: 'Dyslexic',
    fontFamily: "'OpenDyslexic', sans-serif",
  },
];

export function FontSelector() {
  const chatFont = useSettingsStore(selectChatFont);
  const setChatFont = useSettingsStore((s) => s.setChatFont);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold text-sm">Chat Font</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose the typeface used in the chat interface.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {FONT_TILES.map((tile) => {
          const isSelected = chatFont === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => setChatFont(tile.id)}
              aria-pressed={isSelected}
              className={cn(
                'relative w-24 h-16 rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-colors',
                isSelected
                  ? 'border-blue-500 bg-blue-500/5'
                  : 'border-white/10 hover:border-white/20 bg-card',
              )}
            >
              {isSelected && (
                <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-blue-500">
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
              )}
              <span
                className="text-xl font-medium leading-none select-none"
                style={{ fontFamily: tile.fontFamily }}
              >
                Aa
              </span>
              <span className="text-[10px] text-muted-foreground font-medium leading-none">
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

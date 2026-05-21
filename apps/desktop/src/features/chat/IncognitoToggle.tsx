/**
 * IncognitoToggle
 *
 * A compact toggle button that activates incognito mode.
 * When active, new conversations are flagged as incognito so their messages
 * are not persisted to disk or used for training.
 *
 * Competitive parity: mirrors the ghost-icon incognito feature in Claude.ai.
 */
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

interface IncognitoToggleProps {
  isIncognito: boolean;
  onToggle: () => void;
  className?: string;
}

export function IncognitoToggle({ isIncognito, onToggle, className }: IncognitoToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        isIncognito
          ? "Incognito on — chats won't be saved. Click to disable."
          : "Incognito mode — chats won't be saved"
      }
      aria-pressed={isIncognito}
      aria-label={isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'}
      className={cn(
        'flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-200',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
        isIncognito
          ? 'bg-purple-500/15 text-purple-500 hover:bg-purple-500/25 ring-1 ring-purple-500/30'
          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]',
        className,
      )}
    >
      {isIncognito ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

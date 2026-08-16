
import { memo, useCallback, useState } from 'react';
import { Brain, BrainCog } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useMemoryStore } from '@/stores/memoryStore';
import { useIsMounted } from '@/hooks/useIsMounted';

export interface SaveToMemoryButtonProps {
  content: string;
  className?: string;
}

export const SaveToMemoryButton = memo(function SaveToMemoryButton({
  content,
  className,
}: SaveToMemoryButtonProps) {
  const remember = useMemoryStore((s) => s.remember);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const isMounted = useIsMounted();

  const handleSave = useCallback(async () => {
    if (saved || saving || !content.trim()) return;
    setSaving(true);
    try {
      const firstSentence = content.split(/[.!?\n]/)[0]?.slice(0, 80) ?? 'Conversation excerpt';
      await remember('context', firstSentence, content.trim(), 6);
      if (!isMounted.current) return;
      setSaved(true);
      toast.success('Saved to memory', {
        description: 'This message will be remembered in future conversations.',
        duration: 3000,
      });
    } catch {
      toast.error('Failed to save memory. Please try again.');
    } finally {
      if (isMounted.current) {
        setSaving(false);
      }
    }
  }, [content, remember, saved, saving, isMounted]);

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saved || saving || !content.trim()}
      className={cn(
        'p-1.5 rounded transition-colors',
        saved
          ? 'text-blue-500 bg-blue-500/10 cursor-default'
          : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400',
        (saving || !content.trim()) && 'opacity-50 cursor-not-allowed',
        className,
      )}
      title={saved ? 'Already saved to memory' : 'Save to memory'}
      aria-label={saved ? 'Already saved to memory' : 'Save this message to memory'}
    >
      {saved ? (
        <BrainCog size={14} className="text-blue-500" aria-hidden="true" />
      ) : (
        <Brain size={14} aria-hidden="true" />
      )}
    </button>
  );
});

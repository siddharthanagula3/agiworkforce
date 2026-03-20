import { Info, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomInstructionsStore } from '../../stores/customInstructionsStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Switch } from '../ui/Switch';

export function CustomInstructionsSettings() {
  // Use selectors to prevent unnecessary re-renders
  const globalInstructions = useCustomInstructionsStore((s) => s.globalInstructions);
  const globalInstructionsEnabled = useCustomInstructionsStore((s) => s.globalInstructionsEnabled);
  const maxInstructionsLength = useCustomInstructionsStore((s) => s.maxInstructionsLength);

  const [localInstructions, setLocalInstructions] = useState(globalInstructions);
  const [isDirty, setIsDirty] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // Track if we've initialized to prevent loops during hydration
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only sync from store if not dirty (user hasn't made changes)
    // This prevents overwriting user's edits during hydration
    if (!isDirty && (!hasInitialized.current || localInstructions !== globalInstructions)) {
      hasInitialized.current = true;
      setLocalInstructions(globalInstructions);
    }
  }, [globalInstructions, isDirty, localInstructions]);

  const handleInstructionsChange = useCallback(
    (value: string) => {
      setLocalInstructions(value);
      setIsDirty(value !== globalInstructions);
    },
    [globalInstructions],
  );

  const handleSave = useCallback(() => {
    useCustomInstructionsStore.getState().setGlobalInstructions(localInstructions);
    setIsDirty(false);
  }, [localInstructions]);

  const handleReset = useCallback(() => {
    setLocalInstructions(globalInstructions);
    setIsDirty(false);
  }, [globalInstructions]);

  const handleClear = useCallback(() => {
    setLocalInstructions('');
    useCustomInstructionsStore.getState().setGlobalInstructions('');
    setIsDirty(false);
  }, []);

  const charCount = localInstructions.length;
  const charPercentage = (charCount / maxInstructionsLength) * 100;
  const isNearLimit = charPercentage > 80;
  const isAtLimit = charCount >= maxInstructionsLength;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-foreground" />
          Custom Instructions
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Define how the AI should behave across all your conversations. These instructions are
          included in every message you send.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-foreground mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">Instruction Priority</p>
            <p className="text-muted-foreground">
              When multiple instructions exist, they are applied in this order:
            </p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-muted-foreground">
              <li>
                <span className="font-medium">Project instructions</span> - from CLAUDE.md or
                project files
              </li>
              <li>
                <span className="font-medium">Conversation instructions</span> - specific to each
                chat
              </li>
              <li>
                <span className="font-medium">Global instructions</span> - defined here
              </li>
            </ol>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable-global-instructions" className="text-base">
              Enable Global Instructions
            </Label>
            <p className="text-sm text-muted-foreground">
              When disabled, global instructions won't be included in conversations
            </p>
          </div>
          <Switch
            id="enable-global-instructions"
            checked={globalInstructionsEnabled}
            onCheckedChange={(enabled) =>
              useCustomInstructionsStore.getState().setGlobalInstructionsEnabled(enabled)
            }
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="global-instructions">Global Instructions</Label>
            <span
              className={`text-xs ${
                isAtLimit
                  ? 'text-destructive'
                  : isNearLimit
                    ? 'text-yellow-600 dark:text-yellow-500'
                    : 'text-muted-foreground'
              }`}
            >
              {charCount.toLocaleString()} / {maxInstructionsLength.toLocaleString()} characters
            </span>
          </div>
          <textarea
            id="global-instructions"
            value={localInstructions}
            onChange={(e) => handleInstructionsChange(e.target.value)}
            placeholder={`Examples:
- Always respond in a friendly, conversational tone
- When writing code, include helpful comments
- Focus on security best practices
- Explain technical concepts simply`}
            className={`min-h-[200px] w-full rounded-md border bg-background px-3 py-2 text-sm
              placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2
              focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed
              disabled:opacity-50 resize-y font-mono ${!globalInstructionsEnabled ? 'opacity-50' : ''}`}
            disabled={!globalInstructionsEnabled}
            maxLength={maxInstructionsLength}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={!isDirty}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Discard Changes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              disabled={!localInstructions}
              className="text-destructive hover:text-destructive"
            >
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && <div className="text-amber-500 text-sm py-1">You have unsaved changes</div>}
            <Button
              onClick={handleSave}
              disabled={!isDirty}
              size="sm"
              title={!isDirty ? 'No unsaved changes' : undefined}
            >
              Save Instructions
            </Button>
          </div>
        </div>

        <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear custom instructions?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={handleClear}
              >
                Clear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="rounded-lg border border-muted bg-card p-4 space-y-3">
        <h4 className="font-medium text-sm">Tips for Effective Instructions</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li className="flex gap-2">
            <span className="text-foreground">*</span>
            <span>Be specific about the behavior you want</span>
          </li>
          <li className="flex gap-2">
            <span className="text-foreground">*</span>
            <span>Use clear, action-oriented language</span>
          </li>
          <li className="flex gap-2">
            <span className="text-foreground">*</span>
            <span>Include examples when helpful</span>
          </li>
          <li className="flex gap-2">
            <span className="text-foreground">*</span>
            <span>Keep instructions concise - they count toward your token usage</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

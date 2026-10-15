import { FileText, Globe, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCustomInstructionsStore } from '../../stores/customInstructionsStore';
import {
  getConversationInstructions,
  localConversationId,
  setConversationInstructions,
} from './conversationInstructions';
import { Button } from '@/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/Dialog';
import { Label } from '@/ui/Label';
import { Switch } from '@/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs';

interface CustomInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  initialTab?: 'conversation' | 'global';
}

const TEXTAREA_CLASS =
  'min-h-[200px] w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed';

function CharacterCount({ count, max }: { count: number; max: number }) {
  return (
    <span className={`text-xs ${count >= max ? 'text-destructive' : 'text-muted-foreground'}`}>
      {count.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
}

export function CustomInstructionsDialog({
  open,
  onOpenChange,
  conversationId,
  initialTab = 'conversation',
}: CustomInstructionsDialogProps) {
  const globalInstructions = useCustomInstructionsStore((s) => s.globalInstructions);
  const globalInstructionsEnabled = useCustomInstructionsStore((s) => s.globalInstructionsEnabled);
  const maxInstructionsLength = useCustomInstructionsStore((s) => s.maxInstructionsLength);

  const localId = localConversationId(conversationId);
  const [activeTab, setActiveTab] = useState<'conversation' | 'global'>(initialTab);
  const [savedConversationText, setSavedConversationText] = useState('');
  const [conversationText, setConversationText] = useState('');
  const [globalText, setGlobalText] = useState('');
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveTab(conversationId ? initialTab : 'global');
    setGlobalText(globalInstructions);
    setError(null);
    setSavedConversationText('');
    setConversationText('');
    if (localId === null) return;

    let cancelled = false;
    setLoadingConversation(true);
    getConversationInstructions(localId)
      .then((text) => {
        if (cancelled) return;
        setSavedConversationText(text);
        setConversationText(text);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? `This chat's instructions could not be loaded. ${loadError.message}`
              : "This chat's instructions could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingConversation(false);
      });
    return () => {
      cancelled = true;
    };
    // globalInstructions seeds the draft only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localId, conversationId, initialTab]);

  const conversationDirty = localId !== null && conversationText !== savedConversationText;
  const globalDirty = globalText !== globalInstructions;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (conversationDirty && localId !== null) {
        await setConversationInstructions(localId, conversationText.trim());
        setSavedConversationText(conversationText.trim());
      }
      if (globalDirty) {
        useCustomInstructionsStore.getState().setGlobalInstructions(globalText);
      }
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `Your instructions were not saved. ${saveError.message}`
          : 'Your instructions were not saved.',
      );
    } finally {
      setSaving(false);
    }
  }, [conversationDirty, conversationText, globalDirty, globalText, localId, onOpenChange]);

  const globalPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          These apply to every chat unless a chat has its own instructions.
        </p>
        <Switch
          aria-label="Use instructions for all conversations"
          checked={globalInstructionsEnabled}
          onCheckedChange={(enabled) =>
            useCustomInstructionsStore.getState().setGlobalInstructionsEnabled(enabled)
          }
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="global-instructions">Instructions for all conversations</Label>
          <CharacterCount count={globalText.length} max={maxInstructionsLength} />
        </div>
        <textarea
          id="global-instructions"
          value={globalText}
          onChange={(event) => setGlobalText(event.target.value)}
          placeholder="For example: answer in British English and keep code examples short."
          className={TEXTAREA_CLASS}
          disabled={!globalInstructionsEnabled}
          maxLength={maxInstructionsLength}
        />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            Custom instructions
          </DialogTitle>
          <DialogDescription>
            Tell AGI how to respond in this conversation or in every conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {conversationId ? (
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as 'conversation' | 'global')}
              className="flex h-full flex-col"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="conversation" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  This conversation
                </TabsTrigger>
                <TabsTrigger value="global" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  All conversations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="conversation" className="mt-4 flex-1 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {localId === null
                    ? 'Send a first message in this chat, then add instructions that apply only here.'
                    : 'These apply only to this chat and take priority over your instructions for all conversations.'}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="conversation-instructions">
                      Instructions for this conversation
                    </Label>
                    <CharacterCount count={conversationText.length} max={maxInstructionsLength} />
                  </div>
                  <textarea
                    id="conversation-instructions"
                    value={conversationText}
                    onChange={(event) => setConversationText(event.target.value)}
                    placeholder="For example: you are reviewing my thesis draft; point out unclear arguments."
                    className={TEXTAREA_CLASS}
                    disabled={localId === null || loadingConversation}
                    maxLength={maxInstructionsLength}
                  />
                </div>
              </TabsContent>

              <TabsContent value="global" className="mt-4 flex-1">
                {globalPanel}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="mt-4">{globalPanel}</div>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || (!conversationDirty && !globalDirty)}
          >
            {saving ? 'Saving…' : 'Save instructions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

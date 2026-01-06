import { FileText, Globe, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCustomInstructionsStore } from '../stores/customInstructionsStore';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import { Button } from './ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/Dialog';
import { Label } from './ui/Label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';

interface CustomInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, shows conversation-specific instructions tab for this conversation */
  conversationId?: string;
  /** Initial tab to show */
  initialTab?: 'conversation' | 'global';
}

export function CustomInstructionsDialog({
  open,
  onOpenChange,
  conversationId,
  initialTab = 'conversation',
}: CustomInstructionsDialogProps) {
  const {
    globalInstructions,
    globalInstructionsEnabled,
    maxInstructionsLength,
    setGlobalInstructions,
    setGlobalInstructionsEnabled,
  } = useCustomInstructionsStore();

  const { getConversationCustomInstructions, setConversationCustomInstructions } =
    useUnifiedChatStore();

  const [activeTab, setActiveTab] = useState<'conversation' | 'global'>(
    conversationId ? initialTab : 'global',
  );

  // Local state for both instruction types
  const [localConversationInstructions, setLocalConversationInstructions] = useState('');
  const [localGlobalInstructions, setLocalGlobalInstructions] = useState('');
  const [isConversationDirty, setIsConversationDirty] = useState(false);
  const [isGlobalDirty, setIsGlobalDirty] = useState(false);

  // Load initial values when dialog opens or conversation changes
  useEffect(() => {
    if (open) {
      setLocalGlobalInstructions(globalInstructions);
      setIsGlobalDirty(false);

      if (conversationId) {
        const convInstructions = getConversationCustomInstructions(conversationId) || '';
        setLocalConversationInstructions(convInstructions);
        setIsConversationDirty(false);
      }
    }
  }, [open, conversationId, globalInstructions, getConversationCustomInstructions]);

  const handleConversationInstructionsChange = useCallback(
    (value: string) => {
      setLocalConversationInstructions(value);
      const currentInstructions = getConversationCustomInstructions(conversationId) || '';
      setIsConversationDirty(value !== currentInstructions);
    },
    [conversationId, getConversationCustomInstructions],
  );

  const handleGlobalInstructionsChange = useCallback(
    (value: string) => {
      setLocalGlobalInstructions(value);
      setIsGlobalDirty(value !== globalInstructions);
    },
    [globalInstructions],
  );

  const handleSave = useCallback(() => {
    // Save conversation instructions if dirty
    if (conversationId && isConversationDirty) {
      setConversationCustomInstructions(conversationId, localConversationInstructions);
      setIsConversationDirty(false);
    }

    // Save global instructions if dirty
    if (isGlobalDirty) {
      setGlobalInstructions(localGlobalInstructions);
      setIsGlobalDirty(false);
    }

    onOpenChange(false);
  }, [
    conversationId,
    isConversationDirty,
    isGlobalDirty,
    localConversationInstructions,
    localGlobalInstructions,
    setConversationCustomInstructions,
    setGlobalInstructions,
    onOpenChange,
  ]);

  const handleCancel = useCallback(() => {
    // Reset to original values
    setLocalGlobalInstructions(globalInstructions);
    setIsGlobalDirty(false);

    if (conversationId) {
      const convInstructions = getConversationCustomInstructions(conversationId) || '';
      setLocalConversationInstructions(convInstructions);
      setIsConversationDirty(false);
    }

    onOpenChange(false);
  }, [conversationId, globalInstructions, getConversationCustomInstructions, onOpenChange]);

  const hasChanges = isConversationDirty || isGlobalDirty;

  const conversationCharCount = localConversationInstructions.length;
  const globalCharCount = localGlobalInstructions.length;

  const getCharCountColor = (count: number) => {
    const percentage = (count / maxInstructionsLength) * 100;
    if (count >= maxInstructionsLength) return 'text-destructive';
    if (percentage > 80) return 'text-yellow-600 dark:text-yellow-500';
    return 'text-muted-foreground';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Custom Instructions
          </DialogTitle>
          <DialogDescription>
            Customize how the AI responds in this conversation or across all conversations.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {conversationId ? (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'conversation' | 'global')}
              className="h-full flex flex-col"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="conversation" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  This Conversation
                </TabsTrigger>
                <TabsTrigger value="global" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  All Conversations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="conversation" className="flex-1 mt-4 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    These instructions will only apply to this specific conversation. They take
                    priority over global instructions.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="conversation-instructions">Conversation Instructions</Label>
                    <span className={`text-xs ${getCharCountColor(conversationCharCount)}`}>
                      {conversationCharCount.toLocaleString()} /{' '}
                      {maxInstructionsLength.toLocaleString()}
                    </span>
                  </div>
                  <textarea
                    id="conversation-instructions"
                    value={localConversationInstructions}
                    onChange={(e) => handleConversationInstructionsChange(e.target.value)}
                    placeholder="Enter instructions specific to this conversation..."
                    className="min-h-[200px] w-full rounded-md border bg-background px-3 py-2 text-sm
                      placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2
                      focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono"
                    maxLength={maxInstructionsLength}
                  />
                </div>
              </TabsContent>

              <TabsContent value="global" className="flex-1 mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    These instructions will apply to all conversations unless overridden.
                  </p>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="global-enabled" className="text-sm">
                      Enabled
                    </Label>
                    <input
                      id="global-enabled"
                      type="checkbox"
                      checked={globalInstructionsEnabled}
                      onChange={(e) => setGlobalInstructionsEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="global-instructions">Global Instructions</Label>
                    <span className={`text-xs ${getCharCountColor(globalCharCount)}`}>
                      {globalCharCount.toLocaleString()} / {maxInstructionsLength.toLocaleString()}
                    </span>
                  </div>
                  <textarea
                    id="global-instructions"
                    value={localGlobalInstructions}
                    onChange={(e) => handleGlobalInstructionsChange(e.target.value)}
                    placeholder="Enter instructions that apply to all conversations..."
                    className={`min-h-[200px] w-full rounded-md border bg-background px-3 py-2 text-sm
                      placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2
                      focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono
                      ${!globalInstructionsEnabled ? 'opacity-50' : ''}`}
                    disabled={!globalInstructionsEnabled}
                    maxLength={maxInstructionsLength}
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            // No conversation context - only show global instructions
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  These instructions will apply to all conversations unless overridden.
                </p>
                <div className="flex items-center gap-2">
                  <Label htmlFor="global-enabled" className="text-sm">
                    Enabled
                  </Label>
                  <input
                    id="global-enabled"
                    type="checkbox"
                    checked={globalInstructionsEnabled}
                    onChange={(e) => setGlobalInstructionsEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="global-instructions">Global Instructions</Label>
                  <span className={`text-xs ${getCharCountColor(globalCharCount)}`}>
                    {globalCharCount.toLocaleString()} / {maxInstructionsLength.toLocaleString()}
                  </span>
                </div>
                <textarea
                  id="global-instructions"
                  value={localGlobalInstructions}
                  onChange={(e) => handleGlobalInstructionsChange(e.target.value)}
                  placeholder="Enter instructions that apply to all conversations..."
                  className={`min-h-[250px] w-full rounded-md border bg-background px-3 py-2 text-sm
                    placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2
                    focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono
                    ${!globalInstructionsEnabled ? 'opacity-50' : ''}`}
                  disabled={!globalInstructionsEnabled}
                  maxLength={maxInstructionsLength}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save Instructions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

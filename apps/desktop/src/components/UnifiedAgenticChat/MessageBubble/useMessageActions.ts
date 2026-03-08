/**
 * useMessageActions Hook
 *
 * Handles message action logic including copy, bookmark, edit, and retry.
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Check, Bookmark, BookmarkCheck } from 'lucide-react';
import React from 'react';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';

interface UseMessageActionsOptions {
  messageId: string;
  content: string;
  bookmarked?: boolean;
  onCopy?: () => void;
  onEdit?: (content: string) => void;
  onEditSave?: (messageId: string, newContent: string) => void;
  onRegenerate?: () => void;
}

interface UseMessageActionsReturn {
  // Copy state and handler
  copied: boolean;
  handleCopy: () => Promise<void>;
  // Bookmark handler
  handleBookmark: () => void;
  // Edit state and handlers
  isEditing: boolean;
  handleStartEdit: () => void;
  handleCancelEdit: () => void;
  handleSaveEdit: (newContent: string) => void;
  // Retry handler
  handleRetry: () => void;
  // Actions visibility state
  showActions: boolean;
  setShowActions: (show: boolean) => void;
}

export function useMessageActions({
  messageId,
  content,
  bookmarked,
  onCopy,
  onEdit,
  onEditSave,
  onRegenerate,
}: UseMessageActionsOptions): UseMessageActionsReturn {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // AUDIT-005-001 fix: Store timeout ID in ref for cleanup
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMessageBookmark = useUnifiedChatStore((state) => state.toggleMessageBookmark);
  const retryFailedMessage = useUnifiedChatStore((state) => state.retryFailedMessage);

  // AUDIT-005-001 fix: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);

      toast.success('Message copied', {
        icon: React.createElement(Check, { className: 'h-4 w-4' }) as any,
        duration: 2000,
      });
      // AUDIT-005-001 fix: Clear previous timeout before setting new one
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
      onCopy?.();
    } catch (err) {
      console.error('Failed to copy message:', err);
      toast.error('Failed to copy message');
    }
  }, [content, onCopy]);

  const handleBookmark = useCallback(() => {
    toggleMessageBookmark(messageId);

    toast.success(bookmarked ? 'Bookmark removed' : 'Message bookmarked', {
      icon: (bookmarked
        ? React.createElement(Bookmark, { className: 'h-4 w-4' })
        : React.createElement(BookmarkCheck, { className: 'h-4 w-4' })) as any,
      duration: 2000,
    });
  }, [messageId, bookmarked, toggleMessageBookmark]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setShowActions(false);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSaveEdit = useCallback(
    (newContent: string) => {
      setIsEditing(false);
      if (onEditSave) {
        onEditSave(messageId, newContent);
      } else if (onEdit) {
        // Fallback to legacy onEdit behavior
        onEdit(newContent);
      }
    },
    [messageId, onEditSave, onEdit],
  );

  const handleRetry = useCallback(() => {
    retryFailedMessage(messageId);
    onRegenerate?.();
  }, [messageId, retryFailedMessage, onRegenerate]);

  return {
    copied,
    handleCopy,
    handleBookmark,
    isEditing,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleRetry,
    showActions,
    setShowActions,
  };
}

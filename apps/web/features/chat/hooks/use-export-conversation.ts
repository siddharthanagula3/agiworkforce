import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { chatExportService } from '../services/conversation-export';
import type { ChatSession, ChatMessage } from '../types';

export const useExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);

  const exportChat = useCallback(
    async (
      session: ChatSession,
      messages: ChatMessage[],
      format: 'markdown' | 'json' | 'html' | 'text',
    ) => {
      try {
        setIsExporting(true);
        toast.info(`Exporting chat as ${format.toUpperCase()}...`);

        await chatExportService.exportChat(session, messages, format);

        toast.success(`Chat exported successfully as ${format.toUpperCase()}`);
      } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export chat');
        throw error;
      } finally {
        setIsExporting(false);
      }
    },
    [],
  );

  const copyToClipboard = useCallback(
    async (
      session: ChatSession,
      messages: ChatMessage[],
      format: 'markdown' | 'text' = 'markdown',
    ) => {
      try {
        await chatExportService.copyToClipboard(session, messages, format);
        toast.success('Copied to clipboard');
      } catch (error) {
        console.error('Copy failed:', error);
        toast.error('Failed to copy to clipboard');
        throw error;
      }
    },
    [],
  );

  const generateShareLink = useCallback(async (sessionId: string) => {
    try {
      toast.info('Generating share link...');
      const link = await chatExportService.generateShareLink(sessionId);
      setShareLink(link);

      await navigator.clipboard.writeText(link);
      toast.success('Share link copied to clipboard');

      return link;
    } catch (error) {
      console.error('Failed to generate share link:', error);
      toast.error('Failed to generate share link');
      throw error;
    }
  }, []);

  const clearShareLink = useCallback(() => {
    setShareLink(null);
  }, []);

  const exportAsMarkdown = useCallback(
    async (session: ChatSession, messages: ChatMessage[]) => {
      return exportChat(session, messages, 'markdown');
    },
    [exportChat],
  );

  const exportAsJSON = useCallback(
    async (session: ChatSession, messages: ChatMessage[]) => {
      return exportChat(session, messages, 'json');
    },
    [exportChat],
  );

  const exportAsHTML = useCallback(
    async (session: ChatSession, messages: ChatMessage[]) => {
      return exportChat(session, messages, 'html');
    },
    [exportChat],
  );

  const exportAsText = useCallback(
    async (session: ChatSession, messages: ChatMessage[]) => {
      return exportChat(session, messages, 'text');
    },
    [exportChat],
  );

  return {
    isExporting,
    shareLink,
    exportChat,
    exportAsMarkdown,
    exportAsJSON,
    exportAsHTML,
    exportAsText,
    copyToClipboard,
    generateShareLink,
    clearShareLink,
  };
};

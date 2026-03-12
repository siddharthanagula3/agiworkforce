import { FileText, Loader2, Send } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { invoke } from '../../lib/tauri-mock';
import { supabaseAuth } from '../../services/supabaseAuth';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachLogs, setAttachLogs] = useState(true);
  const [logCount, setLogCount] = useState<number | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch log count when dialog opens and attachLogs is checked
  useEffect(() => {
    if (!open) {
      setLogCount(null);
      return;
    }
    if (!attachLogs) {
      setLogCount(null);
      return;
    }

    let cancelled = false;
    setLoadingLogs(true);

    invoke<string[]>('get_filtered_logs')
      .then((logs) => {
        if (!cancelled) {
          setLogCount(logs.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLogCount(0);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLogs(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, attachLogs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setIsSending(true);
    setError(null);

    try {
      const user = await supabaseAuth.getUser();

      let logsText: string | null = null;
      if (attachLogs) {
        try {
          const logLines = await invoke<string[]>('get_filtered_logs');
          if (logLines.length > 0) {
            logsText = logLines.join('\n');
          }
        } catch (err) {
          console.warn('Failed to collect logs:', err);
        }
      }

      await invoke('submit_feedback', {
        subject,
        message,
        userId: user?.id,
        metadata: {
          platform: 'desktop',
          version: '5.0.0',
          userAgent: navigator.userAgent,
        },
        logs: logsText,
      });
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to send feedback. Please try again.');
      setIsSending(false);
      return;
    }

    setSuccess(true);
    setIsSending(false);

    setTimeout(() => {
      setSuccess(false);
      setSubject('');
      setMessage('');
      setAttachLogs(true);
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
              <Send size={20} />
            </div>
            <p className="font-medium">Thank you for your feedback!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label htmlFor="subject" className="text-sm font-medium">
                Subject
              </label>
              <Input
                id="subject"
                placeholder="What is this about?"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium">
                Message
              </label>
              <Textarea
                id="message"
                placeholder="Tell us what you think..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[120px] resize-none"
                required
              />
            </div>

            {/* Log attachment toggle */}
            <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="attach-logs"
                  checked={attachLogs}
                  onCheckedChange={(checked) => setAttachLogs(checked === true)}
                />
                <label
                  htmlFor="attach-logs"
                  className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
                >
                  <FileText size={14} className="text-muted-foreground" />
                  Attach diagnostic logs
                </label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Only warnings and errors are included. No personal or billing data.
              </p>
              {attachLogs && logCount !== null && !loadingLogs && (
                <p className="text-xs text-muted-foreground pl-6">
                  {logCount === 0
                    ? 'No diagnostic logs found.'
                    : `${logCount} log ${logCount === 1 ? 'entry' : 'entries'} will be attached.`}
                </p>
              )}
              {attachLogs && loadingLogs && (
                <p className="text-xs text-muted-foreground pl-6 flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />
                  Scanning logs...
                </p>
              )}
            </div>

            {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSending || !subject.trim() || !message.trim()}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Feedback'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

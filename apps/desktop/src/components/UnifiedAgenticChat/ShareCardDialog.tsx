import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Link, Linkedin, MessageSquare, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { WEB_APP_URL } from '@/api/config';

interface ShareCardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationTitle: string;
  firstMessage: string;
  conversationId: string;
}

function buildShareUrl(conversationId: string): string {
  return `${WEB_APP_URL}/shared/${conversationId}`;
}

export function ShareCardDialog({
  isOpen,
  onClose,
  conversationTitle,
  firstMessage,
  conversationId,
}: ShareCardDialogProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shareUrl = buildShareUrl(conversationId);

  useEffect(() => {
    return () => {
      const timer = copiedTimerRef.current;
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied!');
      const existing = copiedTimerRef.current;
      if (existing !== null) clearTimeout(existing);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [shareUrl]);

  const handleShareX = useCallback(() => {
    const tweetText = encodeURIComponent(`Check out my conversation: ${conversationTitle}`);
    const tweetUrl = encodeURIComponent(shareUrl);
    window.open(
      `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`,
      '_blank',
      'width=600,height=400,noopener,noreferrer',
    );
  }, [conversationTitle, shareUrl]);

  const handleShareLinkedIn = useCallback(() => {
    const linkedInUrl = encodeURIComponent(shareUrl);
    const linkedInTitle = encodeURIComponent(conversationTitle);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${linkedInUrl}&title=${linkedInTitle}`,
      '_blank',
      'width=600,height=500,noopener,noreferrer',
    );
  }, [conversationTitle, shareUrl]);

  const handleShareReddit = useCallback(() => {
    const redditUrl = encodeURIComponent(shareUrl);
    const redditTitle = encodeURIComponent(conversationTitle);
    window.open(
      `https://www.reddit.com/submit?url=${redditUrl}&title=${redditTitle}`,
      '_blank',
      'width=800,height=600,noopener,noreferrer',
    );
  }, [conversationTitle, shareUrl]);

  const handleClose = useCallback(() => {
    setCopied(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const truncatedMessage =
    firstMessage.length > 120 ? `${firstMessage.slice(0, 120)}\u2026` : firstMessage;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          aria-label="Close share dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Branded preview card */}
        <div
          className={cn(
            'relative p-6 pb-5',
            'bg-gradient-to-br from-zinc-900 via-zinc-850 to-zinc-900 dark:from-black dark:via-zinc-900 dark:to-black',
            // Subtle teal gradient border via outline ring
          )}
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          }}
        >
          {/* Gradient border accent at top */}
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, #14b8a6, #6366f1, transparent)',
            }}
          />

          {/* Conversation title */}
          <h2 className="text-xl font-bold text-white leading-snug pr-8 mb-3 line-clamp-2">
            {conversationTitle || 'Untitled conversation'}
          </h2>

          {/* First message preview */}
          {truncatedMessage && (
            <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">{truncatedMessage}</p>
          )}

          {/* AGI Workforce branding */}
          <div className="mt-5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-500/20">
              <span className="text-teal-400 text-xs font-bold">A</span>
            </div>
            <span className="text-xs font-semibold text-teal-400 tracking-wide">AGI Workforce</span>
          </div>

          {/* Gradient border accent at bottom */}
          <div
            className="absolute inset-x-0 bottom-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, #14b8a6, #6366f1, transparent)',
            }}
          />
        </div>

        {/* Share buttons section */}
        <div className="px-6 py-5">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-4 text-center uppercase tracking-wider">
            Share via
          </p>

          {/* Circle share buttons row */}
          <div className="flex items-center justify-center gap-5">
            {/* Copy link */}
            <ShareCircleButton
              label={copied ? 'Copied!' : 'Copy link'}
              onClick={() => void handleCopyLink()}
              icon={
                copied ? <Check className="h-5 w-5 text-green-500" /> : <Link className="h-5 w-5" />
              }
              bgClass="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              iconClass="text-zinc-600 dark:text-zinc-300"
            />

            {/* X / Twitter */}
            <ShareCircleButton
              label="X"
              onClick={handleShareX}
              icon={<XIcon className="h-5 w-5" />}
              bgClass="bg-black hover:bg-zinc-800"
              iconClass="text-white"
            />

            {/* LinkedIn */}
            <ShareCircleButton
              label="LinkedIn"
              onClick={handleShareLinkedIn}
              icon={<Linkedin className="h-5 w-5" />}
              bgClass="bg-[#0077B5] hover:bg-[#006097]"
              iconClass="text-white"
            />

            {/* Reddit */}
            <ShareCircleButton
              label="Reddit"
              onClick={handleShareReddit}
              icon={<MessageSquare className="h-5 w-5" />}
              bgClass="bg-[#FF4500] hover:bg-[#e03d00]"
              iconClass="text-white"
            />
          </div>
        </div>

        {/* Footer: Done button */}
        <div className="px-6 pb-5 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="w-full text-xs text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

/* Inline X (Twitter) icon since lucide-react exports X as close icon, not the platform */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

interface ShareCircleButtonProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  bgClass: string;
  iconClass: string;
}

function ShareCircleButton({ label, onClick, icon, bgClass, iconClass }: ShareCircleButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        title={label}
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          bgClass,
          iconClass,
        )}
        aria-label={label}
      >
        {icon}
      </button>
      <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
  );
}

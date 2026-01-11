import { Check, Copy, Link, Linkedin, Mail, MessageSquare, Newspaper, Twitter } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea'; // This import was not explicitly removed by the instruction, so keeping it.
import { SHARE_PLATFORMS } from '../../../types/marketplace';
import { useMarketplaceStore } from '../marketplaceStore';

export function ShareModal() {
  const { selectedWorkflow, showShareModal, closeShareModal, getShareUrl, getEmbedCode } =
    useMarketplaceStore();

  const [shareUrl, setShareUrl] = useState('');
  const [embedCode, setEmbedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const loadShareData = useCallback(async () => {
    if (!selectedWorkflow) return;

    try {
      const url = await getShareUrl(selectedWorkflow.id);
      setShareUrl(url);

      const code = await getEmbedCode(selectedWorkflow.id);
      setEmbedCode(code);
    } catch (error) {
      console.error('Failed to load share data:', error);
    }
  }, [getEmbedCode, getShareUrl, selectedWorkflow]);

  useEffect(() => {
    if (selectedWorkflow && showShareModal) {
      loadShareData();
    }
  }, [loadShareData, selectedWorkflow, showShareModal]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy embed code:', error);
    }
  };

  const handlePlatformShare = (platformId: string) => {
    if (!selectedWorkflow) return;

    const platform = SHARE_PLATFORMS.find((p) => p.id === platformId);
    if (!platform) return;

    const url = platform.url_template
      .replace('{url}', encodeURIComponent(shareUrl))
      .replace('{title}', encodeURIComponent(selectedWorkflow.title));

    if (platformId === 'direct') {
      handleCopyUrl();
    } else if (platformId === 'email') {
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'width=600,height=400');
    }
  };

  if (!selectedWorkflow) return null;

  return (
    <Dialog open={showShareModal} onOpenChange={closeShareModal}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share "{selectedWorkflow.title}"</DialogTitle>
          <DialogDescription>
            Help others discover this workflow by sharing it on social media or embedding it on your
            website
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Share URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Share Link</label>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyUrl}
                className="flex-shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Social Platforms */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Share on Social Media</label>
            <div className="grid grid-cols-3 gap-3">
              <SharePlatformButton
                icon={<Twitter className="h-5 w-5" />}
                label="Twitter/X"
                onClick={() => handlePlatformShare('twitter')}
                className="bg-black hover:bg-black/90 text-white"
              />
              <SharePlatformButton
                icon={<Linkedin className="h-5 w-5" />}
                label="LinkedIn"
                onClick={() => handlePlatformShare('linkedin')}
                className="bg-[#0077B5] hover:bg-[#0077B5]/90 text-white"
              />
              <SharePlatformButton
                icon={<MessageSquare className="h-5 w-5" />}
                label="Reddit"
                onClick={() => handlePlatformShare('reddit')}
                className="bg-[#FF4500] hover:bg-[#FF4500]/90 text-white"
              />
              <SharePlatformButton
                icon={<Newspaper className="h-5 w-5" />}
                label="Hacker News"
                onClick={() => handlePlatformShare('hackernews')}
                className="bg-[#FF6600] hover:bg-[#FF6600]/90 text-white"
              />
              <SharePlatformButton
                icon={<Mail className="h-5 w-5" />}
                label="Email"
                onClick={() => handlePlatformShare('email')}
                className="bg-gray-600 hover:bg-gray-600/90 text-white"
              />
              <SharePlatformButton
                icon={<Link className="h-5 w-5" />}
                label="Copy Link"
                onClick={() => handlePlatformShare('direct')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              />
            </div>
          </div>

          {/* Embed Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Embed on Website</label>
              <Button variant="ghost" size="sm" onClick={handleCopyEmbed} className="text-xs">
                {embedCopied ? (
                  <>
                    <Check className="h-3 w-3 mr-1 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Code
                  </>
                )}
              </Button>
            </div>
            <Textarea value={embedCode} readOnly rows={4} className="font-mono text-xs bg-muted" />
          </div>

          {/* Social Proof */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="flex-1">
                <p className="font-medium mb-1">Why share?</p>
                <p className="text-sm text-muted-foreground">
                  Sharing workflows helps the community discover valuable automation. Plus, you'll
                  get recognition when others clone your shared workflows!
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 p-4 rounded-lg border bg-card">
            <div className="text-center">
              <p className="text-2xl font-bold">{selectedWorkflow.view_count}</p>
              <p className="text-xs text-muted-foreground">Views</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{selectedWorkflow.clone_count}</p>
              <p className="text-xs text-muted-foreground">Clones</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{selectedWorkflow.avg_rating.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SharePlatformButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

function SharePlatformButton({ icon, label, onClick, className }: SharePlatformButtonProps) {
  return (
    <Button
      variant="default"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 h-auto py-4 ${className}`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </Button>
  );
}

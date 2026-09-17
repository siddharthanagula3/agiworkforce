'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Bell, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, Spinner } from '@agiworkforce/ui';
import { useSession } from '@/lib/identity/client';
import { useNotificationFeed } from '../hooks/use-notification-feed';
import type { NotificationFeedItem } from '../lib/notification-target';

const PANEL_TITLE = 'Notifications';
const MAX_BADGE_COUNT = 9;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function formatNotificationTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const elapsed = Math.max(0, now - then);
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (elapsed < MINUTE_MS) return relative.format(0, 'minute');
  if (elapsed < HOUR_MS) return relative.format(-Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return relative.format(-Math.floor(elapsed / HOUR_MS), 'hour');
  if (elapsed < WEEK_MS) return relative.format(-Math.floor(elapsed / DAY_MS), 'day');
  return new Date(then).toLocaleDateString();
}

function bellLabel(unreadCount: number): string {
  if (unreadCount === 0) return PANEL_TITLE;
  return `${PANEL_TITLE}, ${unreadCount} unread`;
}

interface NotificationRowProps {
  item: NotificationFeedItem;
  onOpen: (item: NotificationFeedItem) => void;
}

function NotificationRow({ item, onOpen }: NotificationRowProps) {
  const isError = item.severity === 'error';
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        data-unread={item.read ? undefined : ''}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
      >
        <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
          {!item.read && <span className="h-2 w-2 rounded-full bg-[var(--chat-accent-primary)]" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            {isError && (
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0 text-[var(--chat-destructive-text)]"
                aria-hidden
              />
            )}
            <span
              className={`truncate text-sm text-[var(--chat-text-primary)] ${item.read ? 'font-normal' : 'font-medium'}`}
            >
              {item.title}
            </span>
          </span>
          {item.message && (
            <span className="line-clamp-2 text-[13px] leading-snug text-[var(--chat-text-secondary)]">
              {item.message}
            </span>
          )}
          <span className="text-xs text-[var(--chat-text-muted)]">
            {formatNotificationTime(item.createdAt)}
            {!item.read && <span className="sr-only">, unread</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useSession();
  const [open, setOpen] = useState(false);
  const [markAllError, setMarkAllError] = useState(false);
  const feed = useNotificationFeed(isLoaded && Boolean(isSignedIn));

  if (!isLoaded || !isSignedIn) return null;

  const openItem = (item: NotificationFeedItem) => {
    feed.markRead(item.id);
    if (!item.href) return;
    setOpen(false);
    router.push(item.href);
  };

  const markAll = async () => {
    setMarkAllError(false);
    const ok = await feed.markAllRead();
    if (!ok) setMarkAllError(true);
  };

  const badge =
    feed.unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(feed.unreadCount);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void feed.refresh();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={bellLabel(feed.unreadCount)}
          data-testid="notification-bell"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--chat-text-secondary)] outline-none transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {feed.unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] px-1 text-[10px] font-semibold leading-none text-[var(--chat-accent-on-primary)]"
            >
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        aria-label={PANEL_TITLE}
        data-testid="notification-panel"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between border-b border-[var(--chat-border-subtle)] px-3 py-2">
          <h2 className="text-sm font-medium text-[var(--chat-text-primary)]">{PANEL_TITLE}</h2>
          {feed.unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAll()}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--chat-text-secondary)] outline-none transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] pointer-coarse:min-h-11"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all as read
            </button>
          )}
        </div>
        {markAllError && (
          <p role="alert" className="px-3 pt-2 text-xs text-[var(--chat-destructive-text)]">
            Those notifications could not be marked as read. Try again.
          </p>
        )}
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1.5">
          {feed.status === 'loading' || feed.status === 'idle' ? (
            <div className="flex justify-center py-8">
              <Spinner size="sm" aria-label="Loading notifications" />
            </div>
          ) : feed.status === 'error' ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <p className="text-sm text-[var(--chat-text-secondary)]">
                Notifications could not be loaded.
              </p>
              <button
                type="button"
                onClick={() => void feed.refresh()}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--chat-text-primary)] outline-none transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] pointer-coarse:min-h-11"
              >
                Try again
              </button>
            </div>
          ) : feed.notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--chat-text-secondary)]">
              When a run finishes, a report is ready or something needs you, it shows up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {feed.notifications.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={openItem} />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

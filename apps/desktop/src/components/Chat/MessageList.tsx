import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VariableSizeList as List } from 'react-window';
import type { CSSProperties } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Message as MessageType, Message as MessageComponent } from './Message';
import { Spinner } from '../ui/Spinner';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface MessageListProps {
  messages: MessageType[];
  loading?: boolean;
  className?: string;
  conversationId?: number | null;
  onRegenerateMessage?: (message: MessageType) => void;
  onEditMessage?: (message: MessageType, content: string) => void | Promise<void>;
  onDeleteMessage?: (message: MessageType) => void | Promise<void>;
}

interface RowData {
  items: MessageListItem[];
  registerSize: (index: number, size: number) => void;
  onRegenerateMessage?: (message: MessageType) => void | Promise<void>;
  onEditMessage?: (message: MessageType, content: string) => void | Promise<void>;
  onDeleteMessage?: (message: MessageType) => void | Promise<void>;
}

interface RowProps {
  index: number;
  style: CSSProperties;
  data: RowData;
}

type MessageListItem =
  | { type: 'message'; key: string; message: MessageType }
  | { type: 'divider'; key: string; label: string }
  | { type: 'loading'; key: string };

const ESTIMATED_ROW_HEIGHT = 120;

const MessageRow = ({ index, style, data }: RowProps) => {
  const { items, registerSize, onRegenerateMessage } = data;
  const { onEditMessage, onDeleteMessage } = data;
  const item = items[index];

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const height = node.getBoundingClientRect().height;
        registerSize(index, height);
      }
    },
    [index, registerSize],
  );

  if (!item) {
    return null;
  }

  if (item.type === 'divider') {
    return (
      <div style={style}>
        <div ref={setRef} className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/70" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {item.label}
            </span>
            <div className="h-px flex-1 bg-border/70" />
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'loading') {
    return (
      <div style={style}>
        <div ref={setRef} className="px-2">
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Spinner size="sm" />
            </div>
            <div className="text-sm text-muted-foreground">Thinking...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={style}>
      <div ref={setRef} className="px-2">
        <MessageComponent
          message={item.message}
          {...(onRegenerateMessage ? { onRegenerate: onRegenerateMessage } : {})}
          {...(onEditMessage ? { onEdit: onEditMessage } : {})}
          {...(onDeleteMessage ? { onDelete: onDeleteMessage } : {})}
        />
      </div>
    </div>
  );
};

export function MessageList({
  messages,
  loading = false,
  className,
  conversationId,
  onRegenerateMessage,
  onEditMessage,
  onDeleteMessage,
}: MessageListProps) {
  const listRef = useRef<List>(null);
  const sizeMap = useRef<Map<number, number>>(new Map());
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [outerElement, setOuterElement] = useState<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const messageIdSetRef = useRef<Set<string>>(new Set());

  const registerSize = useCallback((index: number, size: number) => {
    const current = sizeMap.current.get(index);
    if (current !== size) {
      sizeMap.current.set(index, size);
      listRef.current?.resetAfterIndex(index);
    }
  }, []);

  const getItemSize = useCallback(
    (index: number) => sizeMap.current.get(index) ?? ESTIMATED_ROW_HEIGHT,
    [],
  );

  const items = useMemo(() => {
    const result: MessageListItem[] = [];
    let lastDateKey: string | null = null;
    let unreadDividerInserted = false;

    messages.forEach((message) => {
      const date = message.timestamp;
      const dateKey = date.toDateString();
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        let label = format(date, 'MMM d, yyyy');
        if (isToday(date)) {
          label = 'Today';
        } else if (isYesterday(date)) {
          label = 'Yesterday';
        }
        result.push({
          type: 'divider',
          key: `divider-${dateKey}`,
          label,
        });
      }

      if (firstUnreadId && !unreadDividerInserted && message.id === firstUnreadId) {
        result.push({
          type: 'divider',
          key: `unread-${message.id}`,
          label: 'Unread',
        });
        unreadDividerInserted = true;
      }

      result.push({
        type: 'message',
        key: message.id,
        message,
      });
    });

    if (loading) {
      result.push({ type: 'loading', key: 'loading-indicator' });
    }

    return result;
  }, [messages, loading, firstUnreadId]);

  const itemCount = items.length;

  useEffect(() => {
    if (itemCount > 0) {
      listRef.current?.scrollToItem(itemCount - 1, 'end');
    }
  }, [itemCount, messages.length]);

  useEffect(() => {
    sizeMap.current.clear();
    listRef.current?.resetAfterIndex(0, true);
  }, [conversationId]);

  const handleScroll = useCallback(() => {
    const container = outerRef.current;
    if (!container) {
      return;
    }
    const threshold = 32;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom <= threshold;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setUnreadCount(0);
      setFirstUnreadId(null);
    }
  }, []);

  useEffect(() => {
    if (!outerElement) {
      return;
    }
    outerElement.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      outerElement.removeEventListener('scroll', handleScroll);
    };
  }, [outerElement, handleScroll]);

  useEffect(() => {
    const previousIds = messageIdSetRef.current;
    let newlyAddedIds: string[] = [];
    const nextIds = new Set<string>();

    for (const message of messages) {
      nextIds.add(message.id);
      if (!previousIds.has(message.id)) {
        newlyAddedIds.push(message.id);
      }
    }

    if (newlyAddedIds.length > 0) {
      if (isAtBottom) {
        // Scroll after React flushes updates to ensure new content is measured.
        requestAnimationFrame(() => {
          listRef.current?.scrollToItem(items.length - 1, 'end');
        });
        setUnreadCount(0);
        setFirstUnreadId(null);
      } else {
        setUnreadCount((current) => current + newlyAddedIds.length);
        if (!firstUnreadId) {
          setFirstUnreadId(newlyAddedIds[0] ?? null);
        }
      }
    }

    messageIdSetRef.current = nextIds;
  }, [messages, items.length, isAtBottom, firstUnreadId]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToItem(items.length - 1, 'end');
  }, [items.length]);

  if (messages.length === 0 && !loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No messages yet</p>
          <p className="text-sm text-muted-foreground">
            Start a conversation by sending a message below
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative flex flex-col h-full overflow-hidden', className)}>
      <AutoSizer>
        {({ height, width }) => (
          <List
            height={height}
            width={width}
            itemCount={itemCount}
            itemSize={getItemSize}
            estimatedItemSize={ESTIMATED_ROW_HEIGHT}
            ref={listRef}
            outerRef={(element) => {
              outerRef.current = element;
              setOuterElement(element);
            }}
            itemData={{
              items,
              registerSize,
              ...(onRegenerateMessage ? { onRegenerateMessage } : {}),
              ...(onEditMessage ? { onEditMessage } : {}),
              ...(onDeleteMessage ? { onDeleteMessage } : {}),
            }}
          >
            {MessageRow}
          </List>
        )}
      </AutoSizer>

      {!isAtBottom && (
        <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-end gap-2">
          {unreadCount > 0 && (
            <div className="pointer-events-auto rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
              {unreadCount} new message{unreadCount === 1 ? '' : 's'}
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto shadow"
            onClick={scrollToBottom}
          >
            Scroll to latest
          </Button>
        </div>
      )}
    </div>
  );
}

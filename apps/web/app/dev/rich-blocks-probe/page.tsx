'use client';

import { notFound } from 'next/navigation';
import { List, useDynamicRowHeight, type RowComponentProps } from 'react-window';

import { MarkdownContent } from '@agiworkforce/unified-chat';
import { cn } from '@shared/lib/utils';

const WRITING_PARAGRAPHS = Array.from(
  { length: 18 },
  (_, index) =>
    `Paragraph ${index + 1} of the launch announcement. It keeps going long enough that the reader has to scroll through the block, which is the case the header has to survive.`,
).join('\n\n');

const ANSWER = `Here is the announcement and the email to send with it.

\`\`\`writing
## AGI Workforce is live

${WRITING_PARAGRAPHS}
\`\`\`

\`\`\`email
To: team@example.com
Cc: press@example.com
Subject: We launched today

Hi team,

The announcement is live. Thank you for every late night that got us here.

Best,
Sam
\`\`\`

The answer keeps going after both cards, so the transcript can scroll past them.

${Array.from({ length: 12 }, (_, index) => `Closing note ${index + 1}.`).join('\n\n')}
`;

const DEFAULT_ROW_HEIGHT = 800;
const ROW_COUNT = 1;

function TranscriptRow({ index, style, ariaAttributes }: RowComponentProps<object>) {
  return (
    <div {...ariaAttributes} style={style} className="min-w-0" data-row-index={index}>
      <div className="message-group assistant-group">
        <div
          className="group message-row message-bubble message-row-assistant"
          data-role="assistant"
        >
          <div className="message-inner">
            <div className="message-body min-w-0 flex-1">
              <div className="relative">
                <div
                  className={cn(
                    'prose dark:prose-invert max-w-none',
                    'message-text',
                    'break-words text-start',
                  )}
                >
                  <MarkdownContent content={ANSWER} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RichBlocksProbe() {
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: DEFAULT_ROW_HEIGHT });
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div data-probe-root className="flex h-dvh flex-col bg-[var(--chat-bg)]">
      <header className="flex h-12 shrink-0 items-center border-b border-[var(--chat-border-subtle)] px-4">
        <h1 className="text-sm font-medium">Rich blocks probe</h1>
      </header>
      <div className="relative min-h-0 flex-1">
        <List
          rowComponent={TranscriptRow}
          rowCount={ROW_COUNT}
          rowHeight={rowHeight}
          rowProps={{}}
          role="log"
          aria-label="Chat messages"
          className="h-full [scrollbar-width:thin]"
          style={{ height: '100%', overflowX: 'hidden', overscrollBehaviorY: 'contain' }}
        />
      </div>
    </div>
  );
}

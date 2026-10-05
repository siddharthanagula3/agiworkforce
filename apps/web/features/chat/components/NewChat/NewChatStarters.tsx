'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Calendar,
  Code,
  ListChecks,
  Pencil,
  Telescope,
  X,
  type Icon,
} from '@agiworkforce/icons';
import type { CloudWorkMode } from '@agiworkforce/types';
import { useCapability } from '@agiworkforce/unified-chat';
import { AGI_WORK_LABEL } from '@features/chat/lib/agi-work';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { AGI_WORK_MODE, useChatStore } from '@shared/stores/web-chat-store';
import { NewChatConnectorSuggestions } from './NewChatConnectorSuggestions';

type TopicKey = 'write' | 'learn' | 'code' | 'research' | 'plan';

const TOPICS: readonly { key: TopicKey; Glyph: Icon }[] = [
  { key: 'write', Glyph: Pencil },
  { key: 'learn', Glyph: BookOpen },
  { key: 'code', Glyph: Code },
  { key: 'research', Glyph: Telescope },
  { key: 'plan', Glyph: Calendar },
];

const PROMPT_SLOTS = ['p1', 'p2', 'p3', 'p4'] as const;

const CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-[var(--chat-border)] px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';
const PANEL_CLASS = 'w-full rounded-xl border border-[var(--chat-border)] p-1';
const PANEL_HEADING_CLASS =
  'flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground';
const PROMPT_ROW_CLASS =
  'flex w-full items-center rounded-lg px-3 py-2 text-start text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';
const CLOSE_BUTTON_CLASS =
  'ms-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:h-11 pointer-coarse:w-11';

export interface NewChatStartersProps {
  workMode: CloudWorkMode;
  onPrompt: (prompt: string) => void;
  onFocusComposer: () => void;
  showConnectorHint: boolean;
}

function useAgiWorkAvailable(): boolean {
  const agiWorkCapability = useCapability('canUseAgiWork');
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  return billingPolicyReady && agiWorkCapability;
}

export function NewChatStarters({
  workMode,
  onPrompt,
  onFocusComposer,
  showConnectorHint,
}: NewChatStartersProps) {
  const { t } = useTranslation('common');
  const headingId = useId();
  const agiWorkAvailable = useAgiWorkAvailable();
  const setComposerToggles = useChatStore((state) => state.setComposerToggles);
  const [openTopic, setOpenTopic] = useState<TopicKey | null>(null);
  const returnFocusTopic = useRef<TopicKey | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const chipRefs = useRef(new Map<TopicKey, HTMLButtonElement>());

  useEffect(() => {
    if (openTopic) {
      panelRef.current?.querySelector<HTMLButtonElement>('[data-new-chat-prompt]')?.focus();
      return;
    }
    const topic = returnFocusTopic.current;
    returnFocusTopic.current = null;
    if (topic) chipRefs.current.get(topic)?.focus();
  }, [openTopic]);

  const choosePrompt = (prompt: string) => {
    setOpenTopic(null);
    onPrompt(prompt);
    requestAnimationFrame(onFocusComposer);
  };

  const closeTopic = () => {
    returnFocusTopic.current = openTopic;
    setOpenTopic(null);
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closeTopic();
  };

  const topic = workMode === AGI_WORK_MODE ? null : TOPICS.find(({ key }) => key === openTopic);

  return (
    <div className="mt-3 flex w-full flex-col items-center gap-3">
      {workMode === AGI_WORK_MODE ? (
        <section aria-labelledby={headingId} className={PANEL_CLASS}>
          <h2 id={headingId} className={PANEL_HEADING_CLASS}>
            <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('newChat.agiWorkExamples')}
          </h2>
          <p className="px-3 pb-1 text-sm text-muted-foreground">{t('newChat.agiWorkIntro')}</p>
          <ul>
            {PROMPT_SLOTS.map((slot) => {
              const prompt = t(`newChat.agiWork.${slot}`);
              return (
                <li key={slot}>
                  <button
                    type="button"
                    onClick={() => choosePrompt(prompt)}
                    className={PROMPT_ROW_CLASS}
                  >
                    {prompt}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : topic ? (
        <section
          ref={panelRef}
          aria-labelledby={headingId}
          onKeyDown={closeOnEscape}
          className={PANEL_CLASS}
        >
          <div className={PANEL_HEADING_CLASS}>
            <topic.Glyph className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h2 id={headingId}>{t(`newChat.topics.${topic.key}.label`)}</h2>
            <button
              type="button"
              onClick={closeTopic}
              aria-label={t('newChat.backToTopics')}
              className={CLOSE_BUTTON_CLASS}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul>
            {PROMPT_SLOTS.map((slot) => {
              const prompt = t(`newChat.topics.${topic.key}.${slot}`);
              return (
                <li key={slot}>
                  <button
                    type="button"
                    data-new-chat-prompt=""
                    onClick={() => choosePrompt(prompt)}
                    className={PROMPT_ROW_CLASS}
                  >
                    {prompt}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div
          role="group"
          aria-label={t('newChat.ideasLabel')}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {TOPICS.map(({ key, Glyph }) => (
            <button
              key={key}
              ref={(node) => {
                if (node) chipRefs.current.set(key, node);
                else chipRefs.current.delete(key);
              }}
              type="button"
              onClick={() => setOpenTopic(key)}
              className={CHIP_CLASS}
            >
              <Glyph className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t(`newChat.topics.${key}.label`)}
            </button>
          ))}
          {agiWorkAvailable ? (
            <button
              type="button"
              onClick={() => {
                setComposerToggles({ workMode: AGI_WORK_MODE }, null);
                requestAnimationFrame(onFocusComposer);
              }}
              className={CHIP_CLASS}
            >
              <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
              {AGI_WORK_LABEL}
            </button>
          ) : null}
        </div>
      )}
      <NewChatConnectorSuggestions show={showConnectorHint} />
    </div>
  );
}

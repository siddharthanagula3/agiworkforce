'use client';

import { useEffect, useRef, useState } from 'react';
import { ListChecks, ShieldCheck } from '@agiworkforce/icons';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { useAuthStore } from '@shared/stores/authentication-store';

export const AGI_WORK_INTRO_STORAGE_PREFIX = 'agi-work-intro-seen:';

export const AGI_WORK_INTRO_TITLE = `Hand off a task to ${PRODUCT_NAMES.work}`;
export const AGI_WORK_INTRO_BODY =
  'Describe the result you want. It plans the steps and works through them with your tools.';
export const AGI_WORK_INTRO_POINTS = [
  {
    icon: ShieldCheck,
    text: 'It follows your Tool Approvals settings, so you decide what runs without asking.',
  },
  { icon: ListChecks, text: 'Follow every task from Tasks on the web, desktop or phone.' },
] as const;
export const AGI_WORK_INTRO_CTA = 'Start a new task';

const COMPOSER_SELECTOR = '[data-composer-textarea]';

function storageKey(userId: string): string {
  return `${AGI_WORK_INTRO_STORAGE_PREFIX}${userId}`;
}

function hasSeenIntro(userId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return true;
  }
}

function markIntroSeen(userId: string): void {
  try {
    window.localStorage.setItem(storageKey(userId), '1');
  } catch {
    return;
  }
}

export function AgiWorkIntroDialog() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [open, setOpen] = useState(false);
  const startTaskRef = useRef(false);

  useEffect(() => {
    if (!userId || hasSeenIntro(userId)) return;
    markIntroSeen(userId);
    setOpen(true);
  }, [userId]);

  const close = (startTask: boolean) => {
    startTaskRef.current = startTask;
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(false);
      }}
    >
      <DialogContent
        className="w-[min(96vw,30rem)]"
        data-testid="agi-work-intro-dialog"
        onCloseAutoFocus={(event) => {
          if (!startTaskRef.current) return;
          const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
          if (!composer) return;
          event.preventDefault();
          composer.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{AGI_WORK_INTRO_TITLE}</DialogTitle>
          <DialogDescription className="text-base">{AGI_WORK_INTRO_BODY}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {AGI_WORK_INTRO_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-base text-foreground">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" className="h-10 rounded-full px-5" onClick={() => close(true)}>
            {AGI_WORK_INTRO_CTA}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

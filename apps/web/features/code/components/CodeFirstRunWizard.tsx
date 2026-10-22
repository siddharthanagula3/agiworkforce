'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Cloud,
  Copy,
  GitBranch,
  Monitor,
  ShieldCheck,
  type Icon,
} from '@agiworkforce/icons';
import { CODE_CLI_SIGN_IN_COMMAND, CODE_COPY, CODE_ROUTES } from '../code-surface';
import styles from '../CloudCodePage.module.css';

const VALUE_GLYPH_SIZE = 22;
const BACK_GLYPH_SIZE = 16;
const ACTION_GLYPH_SIZE = 16;
const STEP_SLOT = '{step}';
const TOTAL_SLOT = '{total}';

const STEPS = ['intro', 'terminal', 'github'] as const;
type WizardStep = (typeof STEPS)[number];

const VALUE_POINTS: ReadonlyArray<{ id: string; glyph: Icon; text: string }> = [
  { id: 'cloud', glyph: Cloud, text: CODE_COPY.wizardIntroCloud },
  { id: 'network', glyph: ShieldCheck, text: CODE_COPY.wizardIntroNetwork },
  { id: 'devices', glyph: Monitor, text: CODE_COPY.wizardIntroDevices },
];

function stepCount(step: WizardStep): string {
  return CODE_COPY.wizardStepOf
    .replace(STEP_SLOT, String(STEPS.indexOf(step) + 1))
    .replace(TOTAL_SLOT, String(STEPS.length));
}

function IntroStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <ul className={styles['wizardCard']}>
        {VALUE_POINTS.map(({ id, glyph: Glyph, text }) => (
          <li key={id} className={styles['wizardValueRow']}>
            <span className={styles['wizardValueGlyph']}>
              <Glyph size={VALUE_GLYPH_SIZE} aria-hidden="true" />
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <button type="button" className={styles['wizardPrimary']} onClick={onNext}>
        {CODE_COPY.wizardStart}
      </button>
    </>
  );
}

function TerminalStep({ onNext }: { onNext: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(CODE_CLI_SIGN_IN_COMMAND);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <>
      <div className={styles['wizardTerminal']}>
        <div className={styles['wizardTerminalBar']}>
          <span>{CODE_COPY.wizardTerminalCommandLabel}</span>
          <button type="button" className={styles['wizardCopy']} onClick={() => void copyCommand()}>
            {copy === 'copied' ? (
              <Check size={ACTION_GLYPH_SIZE} aria-hidden="true" />
            ) : (
              <Copy size={ACTION_GLYPH_SIZE} aria-hidden="true" />
            )}
            {copy === 'copied'
              ? CODE_COPY.copiedReply
              : copy === 'failed'
                ? CODE_COPY.wizardCopyFailed
                : CODE_COPY.copyReply}
          </button>
        </div>
        <pre className={styles['wizardTerminalBody']}>
          <span aria-hidden="true">$ </span>
          <code>{CODE_CLI_SIGN_IN_COMMAND}</code>
        </pre>
      </div>
      <Link href={CODE_ROUTES.cli} className={styles['wizardTextLink']}>
        {CODE_COPY.wizardTerminalInstall}
      </Link>
      <button type="button" className={styles['wizardPrimary']} onClick={onNext}>
        {CODE_COPY.wizardContinue}
      </button>
    </>
  );
}

function GithubStep({ onFinish }: { onFinish: () => void }) {
  return (
    <>
      <div className={styles['wizardCard']}>
        <div className={styles['wizardOptionTitle']}>
          <GitBranch size={ACTION_GLYPH_SIZE} aria-hidden="true" />
          <span>{CODE_COPY.wizardGithubOption}</span>
        </div>
        <p className={styles['wizardOptionCopy']}>{CODE_COPY.wizardGithubOptionCopy}</p>
        <a className={styles['wizardPrimary']} href={CODE_ROUTES.githubInstall} onClick={onFinish}>
          {CODE_COPY.firstRunAction}
        </a>
      </div>
      <button type="button" className={styles['wizardTextLink']} onClick={onFinish}>
        {CODE_COPY.wizardSkip}
      </button>
    </>
  );
}

const STEP_HEADINGS: Readonly<Record<WizardStep, { title: string; subtitle: string }>> = {
  intro: { title: CODE_COPY.wizardIntroTitle, subtitle: CODE_COPY.wizardIntroSubtitle },
  terminal: { title: CODE_COPY.wizardTerminalTitle, subtitle: CODE_COPY.wizardTerminalSubtitle },
  github: { title: CODE_COPY.wizardGithubTitle, subtitle: CODE_COPY.wizardGithubSubtitle },
};

export interface CodeFirstRunWizardProps {
  onFinish: () => void;
}

export function CodeFirstRunWizard({ onFinish }: CodeFirstRunWizardProps) {
  const [step, setStep] = useState<WizardStep>('intro');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    titleRef.current?.focus();
  }, [step]);

  const index = STEPS.indexOf(step);
  const heading = STEP_HEADINGS[step];
  const goTo = (next: number) => {
    const target = STEPS[next];
    if (!target) return;
    moved.current = true;
    setStep(target);
  };

  return (
    <div className={styles['wizard']} data-testid="code-first-run">
      <div className={styles['wizardHeader']}>
        <span className={styles['wizardWordmark']}>{CODE_COPY.surface}</span>
        <button
          type="button"
          className={styles['wizardBack']}
          onClick={() => (index === 0 ? onFinish() : goTo(index - 1))}
        >
          <ChevronLeft size={BACK_GLYPH_SIZE} aria-hidden="true" />
          {CODE_COPY.wizardBack}
        </button>
      </div>

      <section className={styles['wizardColumn']} aria-labelledby="code-first-run-title">
        <span className={styles['wizardStepCount']}>{stepCount(step)}</span>
        <h1
          id="code-first-run-title"
          ref={titleRef}
          tabIndex={-1}
          className={styles['wizardTitle']}
        >
          {heading.title}
        </h1>
        <p className={styles['wizardSubtitle']}>{heading.subtitle}</p>
        {step === 'intro' && <IntroStep onNext={() => goTo(index + 1)} />}
        {step === 'terminal' && <TerminalStep onNext={() => goTo(index + 1)} />}
        {step === 'github' && <GithubStep onFinish={onFinish} />}
      </section>
    </div>
  );
}

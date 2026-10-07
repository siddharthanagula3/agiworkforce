'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { stagger, useAnimate, type AnimationSequence } from 'framer-motion';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { useReducedMotionFlag } from '@agiworkforce/ui/auth-scene';

import {
  ANSWER_HEADING,
  ANSWER_LINE,
  AVAILABILITY,
  BEATS,
  CLAIM,
  CLI_TAG,
  ILLUSTRATION_NOTE,
  LANES,
  PRIMARY,
  PROMPT,
  RECEIPT_ROWS,
  SECONDARY,
  type BeatId,
} from './content';
import {
  AnswerShape,
  ASK_DOT,
  AskShape,
  BAR_TOP_PERCENT,
  CARD,
  CARD_CENTER,
  CARD_DROP,
  MARK,
  ReceiptShape,
  rollTransform,
  RouteShape,
  scaleAbout,
} from './shapes';

const T = { ask: 0, route: 1.3, answer: 2.75, receipt: 4.0, resolve: 5.7, end: 6.45 } as const;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.55, 0, 1, 0.45] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
const CUT = { duration: 0.01 } as const;
const PANEL_RADIUS = 16;
const PANEL_REPLAY_MS = 1200;
const RESOLVE_ORDER: readonly BeatId[] = ['receipt', 'answer', 'route', 'ask'];

type Phase = 'film' | 'paused' | 'held';

const WORDS = PROMPT.split(' ');

function all<E extends Element>(from: ParentNode, selector: string): E[] {
  return Array.from(from.querySelectorAll<E>(selector));
}

function first(from: ParentNode, selector: string): Element {
  const found = from.querySelector(selector);
  if (!found) throw new Error(`Frame 5 is missing ${selector}`);
  return found;
}

function prime(film: HTMLElement) {
  for (const el of all<HTMLElement>(
    film,
    '.fr5-word, .fr5-beat-label, .fr5-lane-label, .fr5-answer-text, .fr5-row, .fr5-note',
  )) {
    el.style.opacity = '0';
  }
  for (const el of all<SVGElement>(
    film,
    '[data-part="card"], [data-part="mark"], [data-part="rows"]',
  )) {
    el.style.opacity = '0';
  }
  for (const el of all<SVGElement>(film, '.fr5-bar')) el.setAttribute('width', '0');
  first(film, '[data-part="dot"]').setAttribute('transform', scaleAbout(ASK_DOT.cx, ASK_DOT.cy, 0));
  first(film, '[data-part="rcard"]').setAttribute('transform', `translate(0 ${-CARD_DROP})`);
}

function resetHeld(stage: HTMLElement) {
  for (const el of all<HTMLElement>(stage, '[data-held], .fr5-copy, .fr5-panel-label')) {
    el.removeAttribute('style');
  }
}

function buildSequence(film: HTMLElement, stage: HTMLElement): AnimationSequence {
  const seq: AnimationSequence = [];
  const field = (id: BeatId) => first(film, `[data-f="${id}"]`);
  const box = (id: BeatId) => first(film, `[data-box="${id}"]`);
  const setTransform = (el: Element, render: (value: number) => string) => (value: number) =>
    el.setAttribute('transform', render(value));
  const label = (id: BeatId, at: number) =>
    seq.push([
      first(film, `[data-f="${id}"] .fr5-beat-label`),
      { opacity: [0, 1], y: [12, 0] },
      { at, duration: 0.3, ease: EASE_OUT },
    ]);
  const cut = (from: BeatId, to: BeatId, at: number) => {
    seq.push([field(from), { visibility: 'hidden' }, { at, ...CUT }]);
    seq.push([field(to), { visibility: 'visible' }, { at, ...CUT }]);
  };

  label('ask', T.ask + 0.05);
  seq.push([
    all(film, '[data-f="ask"] .fr5-word'),
    { opacity: [0, 1], y: [24, 0] },
    { at: T.ask + 0.14, duration: 0.34, delay: stagger(0.045), ease: EASE_OUT },
  ]);
  const askDot = first(film, '[data-f="ask"] [data-part="dot"]');
  seq.push([askDot, { opacity: [0, 1] }, { at: T.ask + 0.72, ...CUT }]);
  seq.push([
    setTransform(askDot, (s) => scaleAbout(ASK_DOT.cx, ASK_DOT.cy, s)),
    [0, 1.18, 1],
    { at: T.ask + 0.72, duration: 0.36, times: [0, 0.6, 1], ease: 'easeOut' },
  ]);

  cut('ask', 'route', T.route);
  label('route', T.route + 0.05);
  const bars = all<SVGRectElement>(film, '[data-f="route"] .fr5-bar');
  bars.forEach((bar, i) =>
    seq.push([
      bar,
      { width: [0, 224] },
      { at: T.route + 0.1 + i * 0.22, duration: 0.42, ease: EASE_OUT },
    ]),
  );
  seq.push([
    all(film, '[data-f="route"] .fr5-lane-label'),
    { opacity: [0, 1], x: [-14, 0] },
    { at: T.route + 0.18, duration: 0.3, delay: stagger(0.22), ease: EASE_OUT },
  ]);
  seq.push([
    setTransform(first(film, '[data-f="route"] [data-part="roll"]'), rollTransform),
    [0, 1],
    { at: T.route + 0.76, duration: 0.66, ease: 'easeInOut' },
  ]);

  cut('route', 'answer', T.answer);
  label('answer', T.answer + 0.05);
  const card = first(film, '[data-f="answer"] [data-part="card"]');
  seq.push([card, { opacity: [0, 1] }, { at: T.answer + 0.04, duration: 0.12 }]);
  seq.push([
    setTransform(card, (s) => scaleAbout(CARD_CENTER.cx, CARD_CENTER.cy, s)),
    [0.82, 1.035, 0.99, 1],
    { at: T.answer + 0.04, duration: 0.56, times: [0, 0.5, 0.78, 1], ease: 'easeOut' },
  ]);
  const lines = all<SVGRectElement>(film, '[data-f="answer"] [data-part="line"]');
  lines.forEach((line, i) =>
    seq.push([
      line,
      { width: [0, Number(line.dataset['w'])] },
      { at: T.answer + 0.36 + i * 0.09, duration: 0.28, ease: EASE_OUT },
    ]),
  );
  seq.push([
    first(film, '[data-f="answer"] .fr5-answer-text'),
    { opacity: [0, 1], y: [10, 0] },
    { at: T.answer + 0.66, duration: 0.3, ease: EASE_OUT },
  ]);

  cut('answer', 'receipt', T.receipt);
  label('receipt', T.receipt + 0.05);
  const rcard = first(film, '[data-f="receipt"] [data-part="rcard"]');
  seq.push([
    setTransform(rcard, (ty) => `translate(0 ${ty})`),
    [-CARD_DROP, 0],
    { at: T.receipt + 0.04, duration: 0.34, ease: EASE_IN },
  ]);
  seq.push([
    rcard,
    { attrY: [CARD.y, CARD.y + 10, CARD.y], height: [CARD.h, CARD.h - 10, CARD.h] },
    { at: T.receipt + 0.38, duration: 0.24, times: [0, 0.45, 1], ease: 'easeOut' },
  ]);
  seq.push([
    all(film, '[data-f="receipt"] .fr5-row'),
    { opacity: [0, 1], y: [8, 0] },
    { at: T.receipt + 0.64, duration: 0.2, delay: stagger(0.09), ease: EASE_OUT },
  ]);
  seq.push([
    first(film, '[data-f="receipt"] .fr5-note'),
    { opacity: [0, 1] },
    { at: T.receipt + 1.08, duration: 0.25 },
  ]);
  const mark = first(film, '[data-f="receipt"] [data-part="mark"]');
  seq.push([mark, { opacity: [0, 1] }, { at: T.receipt + 1.18, duration: 0.1 }]);
  seq.push([
    setTransform(mark, (s) => scaleAbout(MARK.cx, MARK.cy, s)),
    [1.8, 1],
    { at: T.receipt + 1.18, duration: 0.18, ease: 'easeOut' },
  ]);

  for (const id of ['ask', 'route', 'answer'] as const) {
    seq.push([field(id), { visibility: 'visible' }, { at: T.resolve, ...CUT }]);
  }
  seq.push([
    all(film, '.fr5-text, .fr5-beat-label, .fr5-note'),
    { opacity: 0 },
    { at: T.resolve, duration: 0.22 },
  ]);
  seq.push([
    first(film, '[data-f="receipt"] [data-part="rows"]'),
    { opacity: [0, 1] },
    { at: T.resolve + 0.3, duration: 0.3 },
  ]);
  RESOLVE_ORDER.forEach((id, i) => {
    const fieldEl = field(id);
    const boxEl = box(id);
    const panel = first(stage, `[data-panel="${id}"]`);
    const f = fieldEl.getBoundingClientRect();
    const b = boxEl.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const inset = {
      top: Math.round(p.top - f.top),
      right: Math.round(f.right - p.right),
      bottom: Math.round(f.bottom - p.bottom),
      left: Math.round(p.left - f.left),
    };
    const scale = p.width / b.width;
    const dx = p.left + p.width / 2 - (b.left + b.width / 2);
    const dy = p.top + p.height / 2 - (b.top + b.height / 2);
    const at = T.resolve + i * 0.04;
    seq.push([
      fieldEl,
      {
        clipPath: [
          'inset(0px 0px 0px 0px round 0px)',
          `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px round ${PANEL_RADIUS}px)`,
        ],
      },
      { at, duration: 0.7, ease: EASE_IN_OUT },
    ]);
    seq.push([
      boxEl,
      { x: [0, dx], y: [0, dy], scale: [1, scale] },
      { at, duration: 0.7, ease: EASE_IN_OUT },
    ]);
  });
  seq.push([first(stage, '[data-held]'), { visibility: 'visible' }, { at: T.resolve, ...CUT }]);
  seq.push([
    first(stage, '.fr5-copy'),
    { opacity: [0, 1], x: [-18, 0] },
    { at: T.resolve + 0.12, duration: 0.6, ease: EASE_OUT },
  ]);
  seq.push([all(film, '.fr5-field'), { visibility: 'hidden' }, { at: T.end, ...CUT }]);
  seq.push([
    all(stage, '.fr5-panel-label'),
    { opacity: [0, 1] },
    { at: T.end, duration: 0.3, delay: stagger(0.05) },
  ]);
  return seq;
}

function Field({ id, index, label }: { id: BeatId; index: string; label: string }) {
  return (
    <div className="fr5-field" data-f={id}>
      <div className="fr5-box" data-box={id}>
        <p className="fr5-beat-label">
          <span className="fr5-beat-index">{index}</span>
          {label}
        </p>
        {id === 'ask' && <AskShape />}
        {id === 'route' && <RouteShape rest={false} />}
        {id === 'answer' && <AnswerShape />}
        {id === 'receipt' && <ReceiptShape rest={false} />}
        <div className="fr5-text">
          {id === 'ask' && (
            <p className="fr5-prompt">
              {WORDS.map((word, i) => (
                <span key={i} className="fr5-word-wrap">
                  <span className="fr5-word">{word}</span>{' '}
                </span>
              ))}
            </p>
          )}
          {id === 'route' &&
            LANES.map((lane) => (
              <p
                key={lane.id}
                className="fr5-lane-label"
                style={{ top: `calc(${BAR_TOP_PERCENT[lane.id]}% - 1.25em - 0.6rem)` }}
              >
                <span className="fr5-lane-name">{lane.name}</span>
                {!lane.live && <span className="fr5-lane-tag">{CLI_TAG}</span>}
              </p>
            ))}
          {id === 'answer' && (
            <div className="fr5-answer-text">
              <p className="fr5-answer-heading">{ANSWER_HEADING}</p>
              <p className="fr5-answer-line">{ANSWER_LINE}</p>
            </div>
          )}
          {id === 'receipt' && (
            <div className="fr5-receipt">
              <dl className="fr5-receipt-rows">
                {RECEIPT_ROWS.map((row) => (
                  <div key={row.label} className="fr5-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        {id === 'receipt' && <p className="fr5-note">{ILLUSTRATION_NOTE}</p>}
      </div>
    </div>
  );
}

function Panel({ id, label }: { id: BeatId; label: string }) {
  const [replaying, setReplaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const replay = useCallback(() => {
    window.clearTimeout(timer.current);
    setReplaying(false);
    timer.current = window.setTimeout(() => {
      setReplaying(true);
      timer.current = window.setTimeout(() => setReplaying(false), PANEL_REPLAY_MS);
    }, 16);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div
      className={replaying ? 'fr5-panel fr5-panel--replay' : 'fr5-panel'}
      data-panel={id}
      onPointerEnter={replay}
    >
      {id === 'ask' && <AskShape />}
      {id === 'route' && <RouteShape rest />}
      {id === 'answer' && <AnswerShape />}
      {id === 'receipt' && <ReceiptShape rest />}
      <p className="fr5-panel-label">{label}</p>
      {id === 'ask' && <p className="fr5-panel-prompt">{PROMPT}</p>}
      {id === 'route' &&
        LANES.map((lane) => (
          <p
            key={lane.id}
            className="fr5-panel-lane"
            style={{ top: `calc(${BAR_TOP_PERCENT[lane.id]}% - 1em - 0.4rem)` }}
          >
            {lane.name}
          </p>
        ))}
    </div>
  );
}

export function CutsStage() {
  const reduced = useReducedMotionFlag();
  const [film, animate] = useAnimate<HTMLDivElement>();
  const stage = useRef<HTMLElement>(null);
  const controls = useRef<ReturnType<typeof animate> | undefined>(undefined);
  const autoPaused = useRef(false);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>('film');
  const motionOn = reduced === false;

  useEffect(() => {
    if (!motionOn) return;
    const filmEl = film.current;
    const stageEl = stage.current;
    if (!filmEl || !stageEl) return;
    let cancelled = false;
    resetHeld(stageEl);
    prime(filmEl);
    const start = async () => {
      await document.fonts.ready;
      if (cancelled) return;
      const playback = animate(buildSequence(filmEl, stageEl));
      controls.current = playback;
      playback.then(() => {
        if (!cancelled) setPhase('held');
      });
    };
    void start();
    return () => {
      cancelled = true;
      controls.current?.stop();
      controls.current = undefined;
    };
  }, [run, motionOn, animate, film]);

  useEffect(() => {
    if (!motionOn) return;
    const pauseIfPlaying = () => {
      if (phase === 'film' && controls.current) {
        controls.current.pause();
        autoPaused.current = true;
      }
    };
    const resumeIfAuto = () => {
      if (autoPaused.current && phase === 'film' && controls.current) {
        controls.current.play();
        autoPaused.current = false;
      }
    };
    const onVisibility = () => (document.hidden ? pauseIfPlaying() : resumeIfAuto());
    document.addEventListener('visibilitychange', onVisibility);
    const stageEl = stage.current;
    const observer = new IntersectionObserver(([entry]) =>
      entry?.isIntersecting ? resumeIfAuto() : pauseIfPlaying(),
    );
    if (stageEl) observer.observe(stageEl);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [motionOn, phase]);

  const togglePause = () => {
    const playback = controls.current;
    if (!playback) return;
    if (phase === 'paused') {
      playback.play();
      setPhase('film');
    } else {
      playback.pause();
      setPhase('paused');
    }
  };

  const skip = () => {
    controls.current?.stop();
    controls.current = undefined;
    if (stage.current) resetHeld(stage.current);
    setPhase('held');
  };

  const replay = () => {
    setPhase('film');
    setRun((n) => n + 1);
  };

  const state: Phase = reduced ? 'held' : phase;

  return (
    <section
      ref={stage}
      className="fr5-stage"
      data-state={state === 'held' ? 'held' : 'film'}
      aria-label="AGI: every answer comes with a receipt"
    >
      <div className="fr5-held" data-held>
        <div className="fr5-copy">
          <p className="fr5-brand">
            <AgiMark size={36} ariaLabel="AGI" />
            <span className="fr5-wordmark" aria-hidden="true">
              AGI
            </span>
          </p>
          <div className="fr5-copy-main">
            <h1 className="fr5-claim">{CLAIM}</h1>
            <div className="fr5-actions">
              <Link href={PRIMARY.href} className="fr5-btn fr5-btn--primary">
                {PRIMARY.label}
              </Link>
              <Link href={SECONDARY.href} className="fr5-btn fr5-btn--secondary">
                {SECONDARY.label}
              </Link>
            </div>
          </div>
          <div className="fr5-copy-foot">
            <p className="fr5-availability">{AVAILABILITY}</p>
            {reduced !== true && (
              <button type="button" className="fr5-replay" onClick={replay}>
                <RotateCcw size={18} aria-hidden="true" />
                Replay the sequence
              </button>
            )}
          </div>
        </div>
        <div className="fr5-poster" data-illustration>
          {BEATS.map((beat) => (
            <Panel key={beat.id} id={beat.id} label={beat.label} />
          ))}
        </div>
      </div>
      {reduced !== true && (
        <div className="fr5-film" key={run} ref={film} data-illustration aria-hidden="true">
          {BEATS.map((beat) => (
            <Field key={beat.id} id={beat.id} index={beat.index} label={beat.label} />
          ))}
        </div>
      )}
      {reduced !== true && state !== 'held' && (
        <div className="fr5-controls">
          <button
            type="button"
            className="fr5-ctl fr5-ctl--icon"
            aria-label={state === 'paused' ? 'Play the sequence' : 'Pause the sequence'}
            onClick={togglePause}
          >
            {state === 'paused' ? (
              <Play size={20} aria-hidden="true" />
            ) : (
              <Pause size={20} aria-hidden="true" />
            )}
          </button>
          <button type="button" className="fr5-ctl" onClick={skip}>
            Skip to the end
          </button>
        </div>
      )}
    </section>
  );
}

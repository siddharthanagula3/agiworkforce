'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { AgiMark } from './AgiMark';

type Step =
  | { kind: 'user'; text: string; model: string }
  | { kind: 'assistant'; text: string; model: string }
  | { kind: 'switch'; from: string; to: string };

const SCRIPT: Step[] = [
  {
    kind: 'user',
    text: 'Plan the route for a private research task.',
    model: 'Claude',
  },
  {
    kind: 'assistant',
    text: 'Use Local for notes and files. Move only the selected summary to Cloud if you need a hosted model.',
    model: 'Claude',
  },
  { kind: 'switch', from: 'Claude', to: 'GPT' },
  {
    kind: 'user',
    text: 'Now turn that into an implementation checklist.',
    model: 'GPT',
  },
  {
    kind: 'assistant',
    text: 'Create the adapter contract, add route labels, preserve the consent gate, then add tests for Local, BYOK, and Cloud paths.',
    model: 'GPT',
  },
];

const STEP_MS = 2200;
const LOOP_PAUSE_MS = 2400;

function reducer(state: { i: number }, action: 'tick' | 'reset'): { i: number } {
  if (action === 'reset') return { i: 0 };
  return { i: state.i + 1 };
}

export function AgiChatDemo() {
  const [{ i }, dispatch] = useReducer(reducer, { i: 0 });
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (reduced) return;
    if (i >= SCRIPT.length) {
      timer.current = setTimeout(() => dispatch('reset'), LOOP_PAUSE_MS);
    } else {
      timer.current = setTimeout(() => dispatch('tick'), STEP_MS);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [i, reduced]);

  const visible = reduced ? SCRIPT : SCRIPT.slice(0, i);

  const firstStep = SCRIPT[0]!;
  let currentModel = firstStep.kind === 'switch' ? firstStep.from : firstStep.model;
  for (let idx = visible.length - 1; idx >= 0; idx--) {
    const step = visible[idx]!;
    if (step.kind === 'switch') {
      currentModel = step.to;
      break;
    }
    currentModel = step.model;
    break;
  }

  const isSwitching =
    !reduced && visible.length > 0 && visible[visible.length - 1]?.kind === 'switch';

  return (
    <div className="agi-chat" aria-label="route preview">
      <div className="agi-chat-header">
        <AgiMark size={16} spinning={isSwitching} />
        <span className="agi-chat-model" key={currentModel}>
          {currentModel}
        </span>
        <span className="agi-chat-meta">preview · example</span>
      </div>

      <div className="agi-chat-body" aria-live="polite">
        {visible.map((step, idx) => {
          if (step.kind === 'switch') {
            return (
              <div key={idx} className="agi-switch">
                <span className="agi-switch-label">switching to {step.to}</span>
              </div>
            );
          }
          const isLast = idx === visible.length - 1;
          return (
            <div
              key={idx}
              className={step.kind === 'assistant' ? 'agi-msg agi-msg-quiet' : 'agi-msg'}
            >
              <div className="agi-msg-role">{step.kind === 'user' ? 'you' : step.model}</div>
              <div className="agi-msg-text">
                {step.text}
                {!reduced && isLast && step.kind === 'assistant' && (
                  <span className="agi-cursor" aria-hidden />
                )}
              </div>
            </div>
          );
        })}

        {visible.length === 0 && !reduced && (
          <div className="agi-msg">
            <div className="agi-msg-role">you</div>
            <div className="agi-msg-text">
              <span className="agi-cursor" aria-hidden />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

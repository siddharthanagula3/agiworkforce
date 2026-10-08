'use client';

import type { FocusEvent, InputHTMLAttributes, ReactNode, Ref, SyntheticEvent } from 'react';
import { useCallback, useEffect, useId, useImperativeHandle, useRef } from 'react';

import { useAuthSceneBridge } from '@agiworkforce/ui/auth-scene';

import {
  AUTH_ERROR_CLASS,
  AUTH_FLOATING_INPUT_CLASS,
  AUTH_FLOATING_LABEL_CLASS,
  AUTH_HINT_CLASS,
} from './authStyles';

const RESTING_PLACEHOLDER = ' ';

export type AuthFieldSensitivity = 'masked' | 'readable';

function personHasActed(): boolean {
  if (typeof navigator === 'undefined' || !('userActivation' in navigator)) return true;
  return navigator.userActivation.hasBeenActive;
}

export function AuthField({
  label,
  error,
  hint,
  description,
  trailing,
  sensitive,
  ref,
  'aria-describedby': describedByCaller,
  ...input
}: {
  label: string;
  ref?: Ref<HTMLInputElement>;
  error?: ReactNode;
  /** A condition of the input itself, announced beside it rather than as a failure. */
  hint?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /**
   * A secret or a one-time code. While it is masked the scene may watch the
   * field's box; while it is readable the scene looks away. It never learns
   * where the caret is or what the field holds.
   */
  sensitive?: AuthFieldSensitivity;
} & InputHTMLAttributes<HTMLInputElement>) {
  const scene = useAuthSceneBridge();
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const descriptionId = `${fieldId}-description`;
  const described = [
    error ? errorId : null,
    hint ? hintId : null,
    description ? descriptionId : null,
    describedByCaller,
  ]
    .filter(Boolean)
    .join(' ');
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const wasErrored = useRef(false);
  const holdsAttention = useRef(false);
  const refocusing = useRef(false);
  const privacySource = `field:${fieldId}`;

  // Submitting leaves focus on the button, so the message the field just grew
  // is behind whoever is reading the page rather than in front of them.
  useEffect(() => {
    const errored = Boolean(error);
    if (errored && !wasErrored.current) {
      const active = document.activeElement;
      const alreadyOnAnErroredField =
        active instanceof HTMLInputElement && active.getAttribute('aria-invalid') === 'true';
      if (!alreadyOnAnErroredField && active !== inputRef.current) {
        refocusing.current = true;
        try {
          inputRef.current?.focus();
        } finally {
          refocusing.current = false;
        }
      }
    }
    wasErrored.current = errored;
  }, [error]);

  const attend = useCallback(
    (target: EventTarget | null, entered: boolean) => {
      if (sensitive === 'readable') {
        scene.setPrivacy(privacySource, true);
        return;
      }
      if (sensitive === 'masked') {
        holdsAttention.current = true;
        scene.watchBox(() => wrapperRef.current?.getBoundingClientRect() ?? null, entered);
        return;
      }
      // A field the page focused at load has the person's attention only once
      // they use it; until then the scene stays free to follow the pointer.
      if (target instanceof HTMLInputElement && personHasActed()) {
        holdsAttention.current = true;
        scene.setFocusTarget(target);
      }
    },
    [privacySource, scene, sensitive],
  );

  const release = useCallback(() => {
    if (sensitive === 'readable') {
      scene.setPrivacy(privacySource, false);
      return;
    }
    if (!holdsAttention.current) return;
    holdsAttention.current = false;
    if (sensitive === 'masked') scene.watchBox(null);
    else scene.setFocusTarget(null);
  }, [privacySource, scene, sensitive]);

  // A field the server marked autofocus is focused before hydration, so the
  // focus event has already happened by the time anything can hear it. The
  // same pass hands a field that changes kind while focused, as a password
  // does when it is shown, from one kind of attention to the other.
  useEffect(() => {
    const field = inputRef.current;
    const wrapper = wrapperRef.current;
    if (field && wrapper && wrapper.contains(document.activeElement)) attend(field, false);
    return release;
  }, [attend, release]);

  // A field disabled while a request is in flight can lose focus without a
  // blur event, which would leave the scene attending to a control nobody is in.
  useEffect(() => {
    if (!input.disabled) return;
    const wrapper = wrapperRef.current;
    if (wrapper && !wrapper.contains(document.activeElement)) release();
  }, [input.disabled, release]);

  // Focus arriving from outside is the person coming to the field; this
  // field putting focus back on itself after a refusal is not.
  const onAttentionGained = (event: FocusEvent<HTMLDivElement>) =>
    attend(event.target, !holdsAttention.current && !refocusing.current);

  // The window losing focus blurs the field with no relatedTarget while the
  // field stays the document's active element; only a real departure releases.
  const onAttentionLost = (event: FocusEvent<HTMLDivElement>) => {
    const wrapper = event.currentTarget;
    const next = event.relatedTarget;
    if (next instanceof Node && wrapper.contains(next)) return;
    if (next === null && wrapper.contains(document.activeElement)) return;
    release();
  };

  const onCaretMoved = (event: SyntheticEvent<HTMLDivElement>) => {
    if (sensitive || event.target !== inputRef.current || !inputRef.current) return;
    if (!holdsAttention.current) attend(inputRef.current, false);
    scene.noteCaret(inputRef.current);
  };

  return (
    <div>
      <div
        ref={wrapperRef}
        className="relative"
        onFocus={onAttentionGained}
        onBlur={onAttentionLost}
        onInput={onCaretMoved}
        onKeyUp={onCaretMoved}
        onPointerUp={onCaretMoved}
        onSelect={onCaretMoved}
      >
        <input
          placeholder={RESTING_PLACEHOLDER}
          {...input}
          ref={inputRef}
          id={fieldId}
          className={`${AUTH_FLOATING_INPUT_CLASS}${trailing ? ' pe-12' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
        />
        <label htmlFor={fieldId} className={AUTH_FLOATING_LABEL_CLASS}>
          {label}
        </label>
        {trailing}
      </div>
      {description ? (
        <p id={descriptionId} className={AUTH_HINT_CLASS}>
          {description}
        </p>
      ) : null}
      {/* The region outlives its text: one mounted together with its content is often not announced. */}
      {hint !== undefined ? (
        <p id={hintId} role="status" className={hint ? AUTH_HINT_CLASS : 'sr-only'}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

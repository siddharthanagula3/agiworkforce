import type { FocusEvent, InputHTMLAttributes, ReactNode, SyntheticEvent } from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';

import { useAuthSceneBridge } from '@agiworkforce/ui/auth-scene';

import { AUTH_ERROR_CLASS, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from './authStyles';

const RESTING_PLACEHOLDER = ' ';

export type AuthFieldSensitivity = 'masked' | 'readable';

export function AuthField({
  label,
  error,
  trailing,
  sensitive,
  ...input
}: {
  label: string;
  error?: ReactNode;
  trailing?: ReactNode;
  sensitive?: AuthFieldSensitivity;
} & InputHTMLAttributes<HTMLInputElement>) {
  const scene = useAuthSceneBridge();
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const holdsAttention = useRef(false);
  const privacySource = `field:${fieldId}`;

  const attend = useCallback(
    (entered: boolean) => {
      if (sensitive === 'readable') {
        scene.setPrivacy(privacySource, true);
        return;
      }
      holdsAttention.current = true;
      if (sensitive === 'masked') {
        scene.watchBox(() => wrapperRef.current?.getBoundingClientRect() ?? null, entered);
        return;
      }
      scene.setFocusTarget(inputRef.current);
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

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper && wrapper.contains(document.activeElement)) attend(false);
    return release;
  }, [attend, release]);

  const onAttentionLost = (event: FocusEvent<HTMLDivElement>) => {
    const wrapper = event.currentTarget;
    const next = event.relatedTarget;
    if (next instanceof Node && wrapper.contains(next)) return;
    if (next === null && wrapper.contains(document.activeElement)) return;
    release();
  };

  const onCaretMoved = (event: SyntheticEvent<HTMLDivElement>) => {
    if (sensitive || event.target !== inputRef.current || !inputRef.current) return;
    scene.noteCaret(inputRef.current);
  };

  return (
    <div>
      <div
        ref={wrapperRef}
        className="relative"
        onFocus={() => attend(!holdsAttention.current)}
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
          className={`${AUTH_INPUT_CLASS}${trailing ? ' pe-12' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <label htmlFor={fieldId} className={AUTH_LABEL_CLASS}>
          {label}
        </label>
        {trailing}
      </div>
      {error ? (
        <p id={errorId} role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

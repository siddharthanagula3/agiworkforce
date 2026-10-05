'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';

import { useAuthCopy } from './authCopy';
import { AuthField } from './AuthField';
import { useAuthSceneBridge } from './scene/AuthSceneContext';

const TOGGLE_CLASS =
  'auth-inline absolute end-0 bottom-1 flex size-11 items-center justify-center rounded-compact text-text-secondary transition-colors hover:text-text-primary';
const TOGGLE_ICON_SIZE = 20;
const ACTIVATION_KEYS = new Set(['Enter', ' ']);

export function AuthPasswordField({
  label,
  name = 'password',
  value,
  error,
  description,
  disabled,
  autoComplete,
  autoFocus = true,
  required = true,
  onChange,
}: {
  label: string;
  name?: string;
  value: string;
  error?: string | null;
  description?: string;
  disabled?: boolean;
  autoComplete: string;
  autoFocus?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const copy = useAuthCopy();
  const scene = useAuthSceneBridge();
  const sourceId = useId();
  const [revealed, setRevealed] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const Glyph = revealed ? EyeOff : Eye;
  const revealedSource = `reveal:${sourceId}`;
  const toggleSource = `toggle:${sourceId}`;
  const shownInTheClear = revealed && value.length > 0;

  // A hidden field gives no way to see that every letter arrived uppercase,
  // which reads as a wrong password until someone notices the key.
  const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.('CapsLock') === true);
  };

  useEffect(() => {
    scene.setPrivacy(revealedSource, shownInTheClear);
  }, [revealedSource, scene, shownInTheClear]);

  useEffect(
    () => () => {
      scene.setPrivacy(revealedSource, false);
      scene.setPrivacy(toggleSource, false);
    },
    [revealedSource, scene, toggleSource],
  );

  // The scene looks away from the moment the button is pressed, pointer or
  // key, so it is already not looking when the click makes the text readable.
  const holdToggle = () => scene.setPrivacy(toggleSource, true);
  const letGoOfToggle = () => scene.setPrivacy(toggleSource, false);

  return (
    <AuthField
      label={label}
      type={revealed ? 'text' : 'password'}
      name={name}
      value={value}
      error={error ?? null}
      description={description}
      disabled={disabled}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      required={required}
      sensitive={revealed ? 'readable' : 'masked'}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={readCapsLock}
      onKeyUp={readCapsLock}
      onBlur={() => setCapsLock(false)}
      hint={capsLock && !revealed ? copy.text('flow.password.capsLock', 'Caps Lock is on') : null}
      trailing={
        <button
          type="button"
          className={TOGGLE_CLASS}
          onPointerDown={holdToggle}
          onPointerCancel={letGoOfToggle}
          onPointerLeave={letGoOfToggle}
          onKeyDown={(event) => {
            if (ACTIVATION_KEYS.has(event.key)) holdToggle();
          }}
          onKeyUp={letGoOfToggle}
          onBlur={letGoOfToggle}
          onClick={() => {
            const next = !revealed;
            scene.setPrivacy(revealedSource, next && value.length > 0);
            scene.setPrivacy(toggleSource, false);
            setRevealed(next);
          }}
          aria-pressed={revealed}
          aria-label={copy.text('flow.password.reveal', 'Show password')}
        >
          <Glyph size={TOGGLE_ICON_SIZE} aria-hidden="true" />
        </button>
      }
    />
  );
}

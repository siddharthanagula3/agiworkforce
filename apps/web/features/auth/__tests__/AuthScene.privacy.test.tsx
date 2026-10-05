import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthCodeStep } from '../AuthCodeStep';
import { AuthEmailStep } from '../AuthEmailStep';
import { AuthLayout } from '../AuthLayout';
import { AuthPasswordStep } from '../AuthPasswordStep';
import { AuthSceneBridgeProvider } from '../scene/AuthSceneContext';
import { SCENE_CHARACTERS, SCENE_MOTION } from '../scene/sceneConfig';
import { createSceneStore, type SceneStore } from '../scene/sceneStore';

const EMAIL = 'person@example.com';
const SECRET = 'correct horse';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const FINE_POINTER = '(pointer: fine)';

function matchMediaThatMatches(matching: readonly string[]) {
  return (query: string): MediaQueryList =>
    ({
      matches: matching.includes(query),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function installMatchMedia(matching: readonly string[]) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMediaThatMatches(matching),
  });
}

function scene(): SVGSVGElement {
  const svg = screen.getByTestId('auth-scene').querySelector('svg');
  if (!svg) throw new Error('the scene did not render');
  return svg;
}

function characters(): HTMLElement[] {
  return [...scene().querySelectorAll<HTMLElement>('.auth-char')];
}

function expectEveryCharacter(pose: string): void {
  expect(characters().map((character) => character.dataset['pose'])).toEqual(
    SCENE_CHARACTERS.map(() => pose),
  );
}

function faceTransform(id: string): string {
  return (
    scene().querySelector(`[data-char="${id}"] [data-part="face"]`)?.getAttribute('transform') ?? ''
  );
}

function passwordStep() {
  return (
    <AuthPasswordStep
      email={EMAIL}
      phase="idle"
      error={null}
      fieldError={null}
      onSubmit={() => undefined}
      onEditEmail={() => undefined}
      onForgotPassword={() => undefined}
      onChooseMethod={() => undefined}
    />
  );
}

function emailStep() {
  return (
    <AuthEmailStep
      mode="login"
      providers={[]}
      switchUrl="/signup"
      ready
      phase="idle"
      error={null}
      fieldError={null}
      switchOffered={false}
      providerPending={null}
      onSubmit={() => undefined}
      onStartProvider={() => undefined}
    />
  );
}

function signInScreen(overrides: Partial<Parameters<typeof AuthEmailStep>[0]> = {}) {
  return (
    <AuthEmailStep
      mode="login"
      providers={[]}
      switchUrl="/signup"
      ready
      phase="idle"
      error={null}
      fieldError={null}
      switchOffered={false}
      providerPending={null}
      onSubmit={() => undefined}
      onSubmitPassword={() => undefined}
      onForgotPassword={() => undefined}
      onStartProvider={() => undefined}
      {...overrides}
    />
  );
}

function withStore(store: SceneStore, children: ReactNode) {
  return <AuthSceneBridgeProvider value={store}>{children}</AuthSceneBridgeProvider>;
}

function codeStep() {
  return (
    <AuthCodeStep
      email={EMAIL}
      phase="idle"
      error={null}
      fieldError={null}
      onSubmit={() => undefined}
      onResend={() => undefined}
      onEditEmail={() => undefined}
    />
  );
}

const canvasContext = HTMLCanvasElement.prototype.getContext;

describe('the characters watch a hidden password and look away from a readable one', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof canvasContext;
    installMatchMedia([]);
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    HTMLCanvasElement.prototype.getContext = canvasContext;
  });

  it('draws the scene out of the accessibility tree and the tab order', () => {
    render(<AuthLayout scene>{emailStep()}</AuthLayout>);

    const panel = screen.getByTestId('auth-scene');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
    expect(panel.textContent).toBe('');
  });

  it('gives each character its own way of not looking', () => {
    render(<AuthLayout scene>{emailStep()}</AuthLayout>);

    expect(characters().map((character) => character.dataset['gesture'])).toEqual(
      SCENE_CHARACTERS.map((character) => character.gesture),
    );
  });

  it('watches the password field with open eyes the moment it takes focus, before anything is typed', () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);

    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(scene()).toHaveAttribute('data-privacy', 'false');
    expect(scene()).toHaveAttribute('data-focus', 'masked');
    expectEveryCharacter('watch');
  });

  it('keeps watching while dots are typed and while focus moves to the reveal button', async () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    await userEvent.type(field, SECRET);
    expectEveryCharacter('watch');

    await userEvent.tab();
    expect(toggle).toHaveFocus();
    expect(scene()).toHaveAttribute('data-privacy', 'false');
    expectEveryCharacter('watch');

    await userEvent.tab({ shift: true });
    expect(field).toHaveFocus();
    expectEveryCharacter('watch');
  });

  it('returns to rest once the field is left hidden', async () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);

    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();

    expect(scene()).toHaveAttribute('data-privacy', 'false');
    expect(scene()).toHaveAttribute('data-focus', 'free');
    expectEveryCharacter('rest');
  });

  it('keeps watching when the window loses focus while the field is still the active element', () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    expect(field).toHaveFocus();

    fireEvent.blur(field, { relatedTarget: null });

    expect(document.activeElement).toBe(field);
    expect(scene()).toHaveAttribute('data-focus', 'masked');

    act(() => field.blur());
    expect(document.activeElement).not.toBe(field);
    expect(scene()).toHaveAttribute('data-focus', 'free');
  });

  it('looks away from the moment the reveal button is pressed, before the text is readable', async () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    await userEvent.type(field, SECRET);

    fireEvent.pointerDown(toggle);
    expect(field).toHaveAttribute('type', 'password');
    expect(scene()).toHaveAttribute('data-privacy', 'true');
    expectEveryCharacter('away');

    fireEvent.click(toggle);
    expect(field).toHaveAttribute('type', 'text');
    expect(scene()).toHaveAttribute('data-privacy', 'true');
    expectEveryCharacter('away');
  });

  it('looks away on the key that activates the reveal button, before the text is readable', async () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    await userEvent.type(field, SECRET);
    await userEvent.tab();
    expect(toggle).toHaveFocus();

    fireEvent.keyDown(toggle, { key: ' ' });
    expect(field).toHaveAttribute('type', 'password');
    expect(scene()).toHaveAttribute('data-privacy', 'true');
    expectEveryCharacter('away');

    fireEvent.click(toggle);
    fireEvent.keyUp(toggle, { key: ' ' });
    expect(field).toHaveAttribute('type', 'text');
    expect(scene()).toHaveAttribute('data-privacy', 'true');
    expectEveryCharacter('away');
  });

  it('holds the pose whether or not the field still has focus, and while the readable text is edited', async () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    await userEvent.type(field, SECRET);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expectEveryCharacter('away');

    act(() => screen.getByRole('button', { name: 'Continue' }).focus());
    expectEveryCharacter('away');

    await userEvent.click(field);
    await userEvent.type(field, ' battery');
    expectEveryCharacter('away');

    await userEvent.clear(field);
    expect(field).toHaveFocus();
    expectEveryCharacter('away');
  });

  it('turns back, watching again, only once the text is dots', async () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    await userEvent.type(field, SECRET);
    await userEvent.click(toggle);
    expectEveryCharacter('away');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(field).toHaveAttribute('type', 'password');
    expect(scene()).toHaveAttribute('data-privacy', 'false');
    expect(scene()).toHaveAttribute('data-relief', 'true');
    expectEveryCharacter('watch');

    act(() => screen.getByRole('button', { name: 'Continue' }).focus());
    expectEveryCharacter('rest');
  });

  it('holds through a pointer press on the reveal button in a browser that does not focus buttons', () => {
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    fireEvent.pointerDown(toggle);
    act(() => field.blur());
    expect(document.activeElement).not.toBe(field);
    expect(scene()).toHaveAttribute('data-privacy', 'true');

    fireEvent.click(toggle);
    expect(scene()).toHaveAttribute('data-privacy', 'false');
  });

  it('looks away from a one-time code, which is readable, and never watches its digits', async () => {
    render(<AuthLayout scene>{codeStep()}</AuthLayout>);

    expect(screen.getByLabelText('Code')).toHaveFocus();
    expect(scene()).toHaveAttribute('data-privacy', 'true');
    expect(scene()).toHaveAttribute('data-focus', 'free');
    expectEveryCharacter('away');

    await userEvent.tab();
    expect(scene()).toHaveAttribute('data-privacy', 'false');
  });

  it('turns attention to a non-sensitive field without looking away', async () => {
    render(<AuthLayout scene>{emailStep()}</AuthLayout>);

    expect(screen.getByLabelText('Email address')).toHaveFocus();
    expect(scene()).toHaveAttribute('data-focus', 'field');
    expect(scene()).toHaveAttribute('data-privacy', 'false');
    expectEveryCharacter('attend');

    await userEvent.tab();
    expect(scene()).toHaveAttribute('data-focus', 'free');
  });

  it('releases the pose when the step that owned it leaves', () => {
    const { rerender } = render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    expect(scene()).toHaveAttribute('data-focus', 'masked');

    rerender(<AuthLayout scene>{emailStep()}</AuthLayout>);

    expect(scene()).toHaveAttribute('data-focus', 'field');
    expect(scene()).toHaveAttribute('data-privacy', 'false');
  });
});

describe('the motion loop', () => {
  const nativeRequestAnimationFrame = window.requestAnimationFrame;

  beforeEach(() => {
    window.sessionStorage.clear();
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof canvasContext;
    window.requestAnimationFrame = vi.fn(() => 1);
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    HTMLCanvasElement.prototype.getContext = canvasContext;
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    vi.restoreAllMocks();
  });

  it('follows the pointer on a fine-pointer device', () => {
    installMatchMedia([FINE_POINTER]);
    const listen = vi.spyOn(window, 'addEventListener');

    render(<AuthLayout scene>{emailStep()}</AuthLayout>);

    expect(scene()).toHaveAttribute('data-motion', 'full');
    expect(listen.mock.calls.map(([type]) => type)).toContain('pointermove');
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it('never tracks the pointer under reduced motion, and still paints the static pose at once', async () => {
    installMatchMedia([REDUCED_MOTION, FINE_POINTER]);
    const listen = vi.spyOn(window, 'addEventListener');

    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');

    expect(scene()).toHaveAttribute('data-motion', 'reduced');
    expect(listen.mock.calls.map(([type]) => type)).not.toContain('pointermove');
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expectEveryCharacter('watch');

    await userEvent.type(field, SECRET);
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expectEveryCharacter('away');
    expect(faceTransform('yellow')).toContain('scale(-1.000 1)');
    const purpleShift = Number(/translate\((-?[\d.]+)/.exec(faceTransform('purple'))?.[1]);
    expect(purpleShift).toBeLessThan(0);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps every pair of eyes shut under reduced motion for as long as the password is readable', async () => {
    installMatchMedia([REDUCED_MOTION, FINE_POINTER]);
    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    await userEvent.type(field, SECRET);
    await userEvent.click(toggle);
    expectEveryCharacter('away');
    expect(characters().filter((character) => character.dataset['turned'] !== undefined)).toEqual(
      [],
    );

    await userEvent.type(field, ' battery');
    act(() => screen.getByRole('button', { name: 'Continue' }).focus());
    expectEveryCharacter('away');
    expect(characters().filter((character) => character.dataset['turned'] !== undefined)).toEqual(
      [],
    );

    await userEvent.click(toggle);
    expect(scene()).toHaveAttribute('data-privacy', 'false');
  });

  it('reopens an eye only for a character the loop has finished turning, and shuts them all again at the next reveal', async () => {
    installMatchMedia([]);
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    let now = 0;
    const runFrames = (count: number) => {
      for (let index = 0; index < count; index += 1) {
        now += 16;
        const callback = frames.shift();
        if (!callback) return;
        act(() => callback(now));
      }
    };
    const turned = () =>
      characters()
        .filter((character) => character.dataset['turned'] === 'true')
        .map((character) => character.dataset['char']);

    render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    await userEvent.type(field, SECRET);
    runFrames(5);
    expect(turned()).toEqual([]);

    fireEvent.pointerDown(toggle);
    expectEveryCharacter('away');
    expect(turned()).toEqual([]);

    fireEvent.click(toggle);
    runFrames(240);
    expect(turned()).toEqual(SCENE_CHARACTERS.map((character) => character.id));

    fireEvent.click(toggle);
    expect(scene()).toHaveAttribute('data-privacy', 'false');
    expectEveryCharacter('watch');

    fireEvent.pointerDown(toggle);
    expectEveryCharacter('away');
    expect(turned()).toEqual([]);

    fireEvent.pointerLeave(toggle);
    runFrames(2);
    expect(scene()).toHaveAttribute('data-privacy', 'false');
    expect(turned()).toEqual([]);
  });
});

describe('a field the page focused before the person did anything', () => {
  function installUserActivation(hasBeenActive: boolean) {
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive, isActive: hasBeenActive },
    });
  }

  beforeEach(() => {
    window.sessionStorage.clear();
    installMatchMedia([]);
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    Reflect.deleteProperty(navigator, 'userActivation');
  });

  it('leaves the characters free to follow the pointer until the address field is used', async () => {
    installUserActivation(false);
    render(<AuthLayout scene>{emailStep()}</AuthLayout>);
    const email = screen.getByLabelText('Email address');

    expect(email).toHaveFocus();
    expect(scene()).toHaveAttribute('data-focus', 'free');
    expectEveryCharacter('rest');

    installUserActivation(true);
    await userEvent.type(email, 'p');

    expect(scene()).toHaveAttribute('data-focus', 'field');
    expectEveryCharacter('attend');
  });

  it('gives the field attention when the person clicks into it where it already has focus', async () => {
    installUserActivation(false);
    render(<AuthLayout scene>{emailStep()}</AuthLayout>);
    const email = screen.getByLabelText('Email address');
    expect(scene()).toHaveAttribute('data-focus', 'free');

    installUserActivation(true);
    fireEvent.pointerUp(email);

    expect(scene()).toHaveAttribute('data-focus', 'field');
  });

  it('ignores what the browser fills in by itself', () => {
    installUserActivation(false);
    render(<AuthLayout scene>{emailStep()}</AuthLayout>);

    fireEvent.input(screen.getByLabelText('Email address'), { target: { value: EMAIL } });

    expect(scene()).toHaveAttribute('data-focus', 'free');
  });

  it('still watches a hidden password field it finds focused, and still looks away from a code', () => {
    installUserActivation(false);
    const { unmount } = render(<AuthLayout scene>{passwordStep()}</AuthLayout>);
    expect(scene()).toHaveAttribute('data-focus', 'masked');
    expectEveryCharacter('watch');
    unmount();

    render(<AuthLayout scene>{codeStep()}</AuthLayout>);
    expect(scene()).toHaveAttribute('data-privacy', 'true');
    expectEveryCharacter('away');
  });
});

describe('the lean-in', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    installMatchMedia([]);
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    vi.useRealTimers();
  });

  it('starts when the person clicks into the hidden password field', async () => {
    const store = createSceneStore();
    render(withStore(store, signInScreen()));
    expect(store.readLeaningIn()).toBe(false);

    await userEvent.click(screen.getByLabelText('Password'));

    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.readLeaningIn()).toBe(true);
  });

  it('starts when the person tabs into it, and ends by itself while they keep typing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const store = createSceneStore();
    render(withStore(store, signInScreen()));

    await userEvent.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(store.readLeaningIn()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(SCENE_MOTION.leanInHoldMs);
    });
    await userEvent.type(screen.getByLabelText('Password'), SECRET);
    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.readLeaningIn()).toBe(false);
  });

  it('does not start again when a shown password is hidden', async () => {
    const store = createSceneStore();
    render(withStore(store, signInScreen()));
    const field = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    await userEvent.type(field, SECRET);

    await userEvent.click(toggle);
    expect(field).toHaveAttribute('type', 'text');
    expect(store.readLeaningIn()).toBe(false);

    await userEvent.click(toggle);
    expect(field).toHaveAttribute('type', 'password');
    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.getSnapshot().privacy).toBe(false);
    expect(store.readLeaningIn()).toBe(false);

    await userEvent.click(field);
    expect(store.readLeaningIn()).toBe(false);
  });

  it('does not start when a refused password takes the focus back', async () => {
    const store = createSceneStore();
    const { rerender } = render(withStore(store, signInScreen()));
    await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
    await userEvent.type(screen.getByLabelText('Password'), SECRET);
    act(() => screen.getByRole('button', { name: 'Continue' }).focus());
    expect(store.getSnapshot().attention).toBe('free');

    rerender(withStore(store, signInScreen({ phase: 'checking_account' })));
    rerender(
      withStore(
        store,
        signInScreen({ passwordError: 'The email and password do not match an account.' }),
      ),
    );

    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.readLeaningIn()).toBe(false);
  });

  it('does not start when the person returns to the field while the refusal still stands', async () => {
    const store = createSceneStore();
    render(
      withStore(
        store,
        signInScreen({ passwordError: 'The email and password do not match an account.' }),
      ),
    );
    store.setMood('error');

    await userEvent.click(screen.getByLabelText('Email address'));
    await userEvent.click(screen.getByLabelText('Password'));

    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.readLeaningIn()).toBe(false);
  });

  it('does not start for a press on the reveal button that brings focus into the field', async () => {
    const store = createSceneStore();
    render(withStore(store, signInScreen()));
    await userEvent.type(screen.getByLabelText('Email address'), EMAIL);

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(store.readLeaningIn()).toBe(false);
  });
});

describe('the plain shell', () => {
  it('draws no scene and keeps the single centred column', () => {
    render(<AuthLayout>{emailStep()}</AuthLayout>);

    expect(screen.queryByTestId('auth-scene')).toBeNull();
    expect(screen.getByTestId('auth-layout')).toHaveAttribute('data-auth-shell', 'plain');
  });

  it('never draws the scene inside an embedded desktop window', () => {
    render(
      <AuthLayout scene embedded>
        {emailStep()}
      </AuthLayout>,
    );

    expect(screen.queryByTestId('auth-scene')).toBeNull();
    expect(screen.getByTestId('auth-layout')).toHaveAttribute('data-embedded', 'true');
  });
});

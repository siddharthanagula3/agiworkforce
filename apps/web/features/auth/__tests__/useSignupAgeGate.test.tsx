import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { ACCOUNT_MINIMUM_AGE, PARENTAL_PERMISSION_BELOW_AGE } from '@agiworkforce/types';

import { useSignupAgeGate } from '../useSignupAgeGate';

const YOUNGEST = String(ACCOUNT_MINIMUM_AGE);
const TOO_YOUNG = String(ACCOUNT_MINIMUM_AGE - 1);

function mountedGate() {
  const hook = renderHook(() => useSignupAgeGate(true));
  const field = document.createElement('input');
  document.body.append(field);
  hook.result.current.fieldRef.current = field;
  return { ...hook, field };
}

describe('the sign-up age gate', () => {
  it.each([
    ['an empty field', '', 'missing'],
    ['spaces only', '   ', 'missing'],
    ['a word', 'twelve', 'invalid'],
    ['zero', '0', 'invalid'],
    ['an impossible age', '999', 'invalid'],
    ['the year under the minimum', TOO_YOUNG, 'too_young'],
  ] as const)('runs nothing for %s, says why and moves focus to the field', (_case, entry, why) => {
    const { result, field } = mountedGate();
    const attempt = vi.fn();
    act(() => result.current.enter(entry));

    let admitted = true;
    act(() => {
      admitted = result.current.admit(attempt);
    });

    expect(admitted).toBe(false);
    expect(attempt).not.toHaveBeenCalled();
    expect(result.current.refusedAs).toBe(why);
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it.each([YOUNGEST, String(PARENTAL_PERMISSION_BELOW_AGE - 1), '18', '64'])(
    'runs the attempt for a %s year old and refuses nothing',
    (age) => {
      const { result, field } = mountedGate();
      const attempt = vi.fn();
      act(() => result.current.enter(age));

      let admitted = false;
      act(() => {
        admitted = result.current.admit(attempt);
      });

      expect(admitted).toBe(true);
      expect(attempt).toHaveBeenCalledTimes(1);
      expect(attempt).toHaveBeenCalledWith();
      expect(result.current.refusedAs).toBeNull();
      field.remove();
    },
  );

  it('keeps a refusal until the entry is eligible, then lets the next attempt through', () => {
    const { result, field } = mountedGate();
    const attempt = vi.fn();
    act(() => result.current.enter(TOO_YOUNG));
    act(() => {
      result.current.admit(attempt);
    });
    expect(result.current.refusedAs).toBe('too_young');

    act(() => result.current.enter('1'));
    expect(result.current.refusedAs).toBe('too_young');

    act(() => result.current.enter(YOUNGEST));
    expect(result.current.refusedAs).toBeNull();
    expect(result.current.verdict).toBe('eligible');

    act(() => {
      result.current.admit(attempt);
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    field.remove();
  });

  it('judges each attempt on the entry as it stands, not as it stood when first admitted', () => {
    const { result, field } = mountedGate();
    const attempt = vi.fn();
    act(() => result.current.enter(YOUNGEST));
    act(() => {
      result.current.admit(attempt);
    });
    act(() => result.current.enter(TOO_YOUNG));
    act(() => {
      result.current.admit(attempt);
    });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(result.current.refusedAs).toBe('too_young');
    field.remove();
  });

  it('is open when the screen does not ask for an age', () => {
    const { result } = renderHook(() => useSignupAgeGate(false));
    const attempt = vi.fn();

    let admitted = false;
    act(() => {
      admitted = result.current.admit(attempt);
    });

    expect(admitted).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(result.current.refusedAs).toBeNull();
  });

  it('forgets the entry and its refusal on request', () => {
    const { result, field } = mountedGate();
    act(() => result.current.enter(TOO_YOUNG));
    act(() => {
      result.current.admit(vi.fn());
    });

    act(() => result.current.forget());

    expect(result.current.age).toBe('');
    expect(result.current.refusedAs).toBeNull();
    field.remove();
  });

  it('starts empty on every mount and leaves nothing behind in the browser', () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    const cookiesBefore = document.cookie;
    const first = renderHook(() => useSignupAgeGate(true));
    act(() => first.result.current.enter('41'));
    act(() => {
      first.result.current.admit(vi.fn());
    });
    first.unmount();

    const second = renderHook(() => useSignupAgeGate(true));

    expect(second.result.current.age).toBe('');
    expect(second.result.current.verdict).toBe('missing');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookiesBefore);
  });
});

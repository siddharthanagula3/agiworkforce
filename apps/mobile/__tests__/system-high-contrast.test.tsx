import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useSystemHighContrast } from '../src/ui/theme/useSystemHighContrast';

describe('useSystemHighContrast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads Android high-text contrast and follows live changes', async () => {
    let onChange: ((enabled: boolean) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
      expect(event).toBe('highTextContrastChanged');
      onChange = listener;
      return { remove };
    });

    const { result, unmount } = renderHook(() => useSystemHighContrast('android'));

    await waitFor(() => expect(result.current).toBe(true));
    expect(AccessibilityInfo.isHighTextContrastEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.isDarkerSystemColorsEnabled).not.toHaveBeenCalled();

    act(() => onChange?.(false));
    expect(result.current).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('reads iOS darker-system-colors and subscribes to its native event', async () => {
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event) => {
      expect(event).toBe('darkerSystemColorsChanged');
      return { remove };
    });

    const { result, unmount } = renderHook(() => useSystemHighContrast('ios'));

    await waitFor(() => expect(result.current).toBe(true));
    expect(AccessibilityInfo.isDarkerSystemColorsEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      'darkerSystemColorsChanged',
      expect.any(Function),
    );

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stays disabled on unsupported platforms without subscribing', async () => {
    const addEventListener = jest.spyOn(AccessibilityInfo, 'addEventListener');

    const { result } = renderHook(() => useSystemHighContrast('web'));

    await waitFor(() => expect(result.current).toBe(false));
    expect(
      addEventListener.mock.calls.some(
        ([event]) => event === 'highTextContrastChanged' || event === 'darkerSystemColorsChanged',
      ),
    ).toBe(false);
  });

  it('shares one native subscription across concurrent theme consumers', async () => {
    let onChange: ((enabled: boolean) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(false);
    const addEventListener = jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((event, listener) => {
        if (event === 'highTextContrastChanged') onChange = listener;
        return { remove };
      });

    const first = renderHook(() => useSystemHighContrast('android'));
    const second = renderHook(() => useSystemHighContrast('android'));

    expect(
      addEventListener.mock.calls.filter(([event]) => event === 'highTextContrastChanged'),
    ).toHaveLength(1);
    act(() => onChange?.(true));
    await waitFor(() => {
      expect(first.result.current).toBe(true);
      expect(second.result.current).toBe(true);
    });

    first.unmount();
    expect(remove).not.toHaveBeenCalled();
    second.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale initial query overwrite a newer native event', async () => {
    let onChange: ((enabled: boolean) => void) | undefined;
    let resolveInitial: ((enabled: boolean) => void) | undefined;
    jest
      .spyOn(AccessibilityInfo, 'isHighTextContrastEnabled')
      .mockImplementation(() => new Promise((resolve) => (resolveInitial = resolve)));
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'highTextContrastChanged') onChange = listener;
      return { remove: jest.fn() };
    });

    const { result } = renderHook(() => useSystemHighContrast('android'));

    act(() => onChange?.(true));
    expect(result.current).toBe(true);

    await act(async () => {
      resolveInitial?.(false);
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });
});

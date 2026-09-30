import { Alert } from 'react-native';

const mockStore = new Map<string, string>();
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => mockStore.set(key, value),
  },
}));

import { surfaceTermsNotice } from '../services/termsNotice';

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

describe('the Terms notice on a chat turn', () => {
  beforeEach(() => mockStore.clear());

  it('tells the user once per published version', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    surfaceTermsNotice(headers({ 'X-AGI-Terms-Notice': '2026-10-01' }));
    surfaceTermsNotice(headers({ 'X-AGI-Terms-Notice': '2026-10-01' }));
    surfaceTermsNotice(headers({}));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[1]).toContain('Using AGI Workforce means you accept them');
  });

  it('names the deadline while a material revision is pending', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    surfaceTermsNotice(
      headers({
        'X-AGI-Terms-Notice': '2026-11-01',
        'X-AGI-Terms-Required-From': '2026-12-01T00:00:00.000Z',
      }),
    );

    expect(alert.mock.calls.at(-1)?.[1]).toContain('Accept them by');
  });
});

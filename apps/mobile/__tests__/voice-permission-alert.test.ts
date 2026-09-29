import { Alert, Linking } from 'react-native';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';

describe('voice permission recovery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens device Settings from a denied microphone alert', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

    showVoicePermissionAlert('Allow microphone access to use voice.');

    const actions = alert.mock.calls[0]?.[2];
    expect(actions?.map((action) => action.text)).toEqual(['Not now', 'Open Settings']);
    actions?.[1]?.onPress?.();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});
jest.mock('@/lib/safeOpenURL', () => ({
  isInAppBrowsableUrl: jest.fn(() => true),
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

const mockTheme = { isDark: false, colors: {} as Record<string, string> };
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => mockTheme,
    useThemeColors: () => mockTheme.colors,
  };
});

import { useState, type ReactElement } from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { getColors } from '../src/ui/theme/tokens';
import { ComposerFullScreenEditor } from '../src/features/chat/components/ComposerFullScreenEditor';
import { MapViewer } from '../src/features/chat/components/cards/MapViewer';
import { PlaceDetailSheet } from '../src/features/chat/components/cards/PlaceDetailSheet';

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function owningScreen() {
  const listeners: Record<string, () => void> = {};
  const navigation = {
    isFocused: jest.fn(() => true),
    addListener: jest.fn((event: string, listener: () => void) => {
      listeners[event] = listener;
      return () => delete listeners[event];
    }),
  };
  const within = (element: ReactElement) =>
    render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <NavigationContext.Provider value={navigation as never}>
          {element}
        </NavigationContext.Provider>
      </SafeAreaProvider>,
    );
  return { navigation, within, blur: () => act(() => listeners.blur?.()) };
}

beforeEach(() => {
  mockTheme.colors = getColors('light', 'light', false);
});

describe('viewers close when their screen loses focus', () => {
  it('collapses the composer editor and keeps the draft the person typed', () => {
    const { within, blur } = owningScreen();
    function Host() {
      const [open, setOpen] = useState(true);
      const [text, setText] = useState('draft kept');
      return (
        <>
          <ComposerFullScreenEditor
            visible={open}
            value={text}
            onChangeText={setText}
            sendState="idle"
            canSend
            onClose={() => setOpen(false)}
            onSend={jest.fn()}
          />
          {open ? null : <TextInput testID="composer" value={text} onChangeText={setText} />}
        </>
      );
    }
    within(<Host />);
    fireEvent.changeText(screen.getByTestId('chat.composer.fullscreen.input'), 'draft typed');

    blur();

    expect(screen.queryByTestId('chat.composer.fullscreen.input')).toBeNull();
    expect(screen.getByTestId('composer').props.value).toBe('draft typed');
  });

  it('leaves the composer editor alone while it is closed', () => {
    const onClose = jest.fn();
    const { within, blur } = owningScreen();
    within(
      <ComposerFullScreenEditor
        visible={false}
        value="draft"
        onChangeText={jest.fn()}
        sendState="idle"
        canSend
        onClose={onClose}
        onSend={jest.fn()}
      />,
    );

    blur();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the full screen map', () => {
    const onClose = jest.fn();
    const { within, blur } = owningScreen();
    within(
      <MapViewer
        visible
        title="Map of Texas day"
        initialView={{ latitude: 30.27, longitude: -97.74, zoom: 6 }}
        zoomBounds={{ min: 3, max: 12 }}
        points={[]}
        tileUri={() => 'https://app.agi.example/api/maps/tile/6/0/0'}
        headers={{}}
        attribution="Light tile credit"
        markerAnchor={{ width: 24, height: 24 }}
        renderMarker={() => null}
        onClose={onClose}
      />,
    );

    blur();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the place details sheet', () => {
    const onClose = jest.fn();
    const { within, blur } = owningScreen();
    within(
      <PlaceDetailSheet
        place={{
          placeId: 'place-one',
          name: 'Cafe One',
          latitude: 30.2672,
          longitude: -97.7431,
          openNow: true,
        }}
        index={0}
        total={1}
        note={null}
        photoAccess={null}
        attribution="Provider credit"
        termsUrl={undefined}
        onClose={onClose}
        onStep={jest.fn()}
      />,
    );

    blur();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close the place details sheet when no place is open', () => {
    const onClose = jest.fn();
    const { within, blur } = owningScreen();
    within(
      <PlaceDetailSheet
        place={null}
        index={0}
        total={0}
        note={null}
        photoAccess={null}
        attribution="Provider credit"
        termsUrl={undefined}
        onClose={onClose}
        onStep={jest.fn()}
      />,
    );

    blur();

    expect(onClose).not.toHaveBeenCalled();
  });
});

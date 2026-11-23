/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { BackHandler } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

let mockWindowWidth = 750;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWindowWidth, height: 1334, scale: 2, fontScale: 1 }),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    getNumber: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockSheetProps: {
  current: {
    onClose?: () => void;
    onChange?: (index: number) => void;
    onAnimate?: (fromIndex: number, toIndex: number) => void;
    style?: unknown;
  } | null;
} = { current: null };

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { ScrollView, TextInput, View } = require('react-native');
  const BottomSheet = React.forwardRef(
    ({ children, ...props }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      mockSheetProps.current = props;
      React.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn(), close: jest.fn() }));
      return <View>{children}</View>;
    },
  );
  BottomSheet.displayName = 'BottomSheet';
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: ScrollView,
    BottomSheetTextInput: TextInput,
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : () => <View />),
    },
  );
});

jest.mock('@/src/features/model-picker/components/ModelRow', () => {
  const { Text } = require('react-native');
  return {
    ModelRow: ({ model }: { model: { id: string } }) => (
      <Text testID={`picker-row-${model.id}`}>{model.id}</Text>
    ),
  };
});

jest.mock('@/src/features/model-picker/installStore', () => {
  const state = {
    jobs: {},
    installedModelIds: [] as string[],
    readySystemModelIds: [] as string[],
    hydrateInstalledModels: () => Promise.resolve(),
    prepareModel: () => Promise.resolve(),
    statusForModel: () => ({ status: 'ready', progress: 1 }),
  };
  return {
    useModelInstallStore: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

import { ModelPickerSheet } from '../components/ModelPickerSheet';
import { LOCAL_MODEL_LIST } from '../service';
import { useModelStore } from '../store';

const [FIRST, SECOND] = LOCAL_MODEL_LIST.filter((model) => model.availability !== 'locked');

const sheetRef = { current: { snapToIndex: jest.fn(), close: jest.fn() } };

function pickerElement(openSignal = 0, paneWidth?: number) {
  return (
    <ModelPickerSheet
      sheetRef={sheetRef as unknown as React.RefObject<never>}
      modelScope="local"
      openSignal={openSignal}
      paneWidth={paneWidth}
    />
  );
}

function renderPicker() {
  return render(pickerElement());
}

function search(screen: ReturnType<typeof render>, text: string) {
  act(() => {
    fireEvent.changeText(screen.getByTestId('model-picker-search-input'), text);
  });
}

function renderOpenPicker() {
  const screen = renderPicker();
  act(() => mockSheetProps.current?.onChange?.(0));
  return screen;
}

describe('model picker search', () => {
  beforeEach(() => {
    useModelStore.setState({ favorites: [], recentModels: [] });
  });

  it('has two distinct on-device models to work with', () => {
    expect(FIRST).toBeDefined();
    expect(SECOND).toBeDefined();
    expect(FIRST?.id).not.toBe(SECOND?.id);
  });

  it('shows a recent model that is not a favorite when it is the only match', () => {
    useModelStore.setState({ recentModels: [FIRST!.id] });
    const screen = renderOpenPicker();

    search(screen, FIRST!.id);

    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
    expect(screen.queryByText(/No models matching/)).toBeNull();
  });

  it('shows each matching model once when a recent favorite matches', () => {
    useModelStore.setState({ recentModels: [FIRST!.id], favorites: [FIRST!.id] });
    const screen = renderOpenPicker();

    search(screen, FIRST!.id);

    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
  });

  it('keeps a recent match beside other matches and drops non-matches', () => {
    useModelStore.setState({ recentModels: [FIRST!.id] });
    const screen = renderOpenPicker();

    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
    expect(screen.getByText('Recent')).toBeTruthy();

    search(screen, SECOND!.id);
    expect(screen.getAllByTestId(`picker-row-${SECOND!.id}`)).toHaveLength(1);
    expect(screen.queryByTestId(`picker-row-${FIRST!.id}`)).toBeNull();
  });

  it('says nothing matches only when nothing does, and restores Recent when cleared', () => {
    useModelStore.setState({ recentModels: [FIRST!.id] });
    const screen = renderOpenPicker();

    search(screen, 'no-such-model-anywhere');
    expect(screen.getByText(/No models matching/)).toBeTruthy();

    search(screen, '');
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
  });

  it('clears the typed query when the sheet closes', () => {
    const screen = renderOpenPicker();
    search(screen, 'Wh');

    act(() => mockSheetProps.current?.onClose?.());
    expect(screen.queryByTestId('model-picker-search-input')).toBeNull();
    act(() => mockSheetProps.current?.onChange?.(0));

    expect(screen.getByTestId('model-picker-search-input').props.value).toBe('');
  });

  it('clears the typed query when the sheet starts opening again', () => {
    const screen = renderOpenPicker();
    search(screen, 'Wh');

    act(() => mockSheetProps.current?.onAnimate?.(-1, 0));

    expect(screen.getByTestId('model-picker-search-input').props.value).toBe('');
  });

  it('clears the typed query when an open is signalled', () => {
    const screen = renderOpenPicker();
    search(screen, 'Wh');

    screen.rerender(pickerElement(1));

    expect(screen.getByTestId('model-picker-search-input').props.value).toBe('');
  });

  it('keeps the query while the sheet moves between open positions', () => {
    const screen = renderOpenPicker();
    search(screen, 'Wh');

    act(() => mockSheetProps.current?.onAnimate?.(0, 1));

    expect(screen.getByTestId('model-picker-search-input').props.value).toBe('Wh');
  });
});

describe('model picker hardware back', () => {
  it('closes the sheet on back only while it is open', () => {
    const remove = jest.fn();
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
    renderPicker();
    expect(add).not.toHaveBeenCalled();

    act(() => mockSheetProps.current?.onChange?.(0));
    const handler = add.mock.calls.at(-1)?.[1] as () => boolean;

    expect(add).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(handler()).toBe(true);
    expect(sheetRef.current.close).toHaveBeenCalledTimes(1);

    act(() => mockSheetProps.current?.onChange?.(-1));
    expect(remove).toHaveBeenCalledTimes(1);
    add.mockRestore();
  });

  it('answers back while the sheet slides open and lets it go when that opening is closed', () => {
    const remove = jest.fn();
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
    renderPicker();

    act(() => mockSheetProps.current?.onAnimate?.(-1, 0));
    const handler = add.mock.calls.at(-1)?.[1] as () => boolean;

    expect(add).toHaveBeenCalledTimes(1);
    expect(handler()).toBe(true);
    expect(sheetRef.current.close).toHaveBeenCalledTimes(1);

    act(() => mockSheetProps.current?.onClose?.());
    expect(remove).toHaveBeenCalledTimes(1);
    add.mockRestore();
  });

  describe('sheet width', () => {
    afterEach(() => {
      mockWindowWidth = 750;
    });

    it.each([
      [402, 0],
      [820, 50],
      [1032, 16],
      [1376, 188],
    ])(
      'insets the sheet to the reading column of the pane in a %d point window',
      (width, inset) => {
        mockWindowWidth = width;
        renderPicker();

        expect(mockSheetProps.current?.style).toEqual({ marginHorizontal: inset });
      },
    );

    it('insets by the width it is given when it is not beside the sidebar', () => {
      mockWindowWidth = 1032;
      render(pickerElement(0, 1032));

      expect(mockSheetProps.current?.style).toEqual({ marginHorizontal: 156 });
    });
  });
});

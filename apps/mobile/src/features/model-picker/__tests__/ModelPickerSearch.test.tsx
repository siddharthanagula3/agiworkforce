/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { ScrollView, TextInput, View } = require('react-native');
  const BottomSheet = React.forwardRef(
    ({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
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

function renderPicker() {
  const sheetRef = { current: { snapToIndex: jest.fn(), close: jest.fn() } };
  return render(
    <ModelPickerSheet
      sheetRef={sheetRef as unknown as React.RefObject<never>}
      modelScope="local"
      openSignal={0}
    />,
  );
}

function search(screen: ReturnType<typeof render>, text: string) {
  act(() => {
    fireEvent.changeText(screen.getByTestId('model-picker-search-input'), text);
  });
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
    const screen = renderPicker();

    search(screen, FIRST!.id);

    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
    expect(screen.queryByText(/No models matching/)).toBeNull();
  });

  it('shows each matching model once when a recent favorite matches', () => {
    useModelStore.setState({ recentModels: [FIRST!.id], favorites: [FIRST!.id] });
    const screen = renderPicker();

    search(screen, FIRST!.id);

    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
  });

  it('keeps a recent match beside other matches and drops non-matches', () => {
    useModelStore.setState({ recentModels: [FIRST!.id] });
    const screen = renderPicker();

    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
    expect(screen.getByText('Recent')).toBeTruthy();

    search(screen, SECOND!.id);
    expect(screen.getAllByTestId(`picker-row-${SECOND!.id}`)).toHaveLength(1);
    expect(screen.queryByTestId(`picker-row-${FIRST!.id}`)).toBeNull();
  });

  it('says nothing matches only when nothing does, and restores Recent when cleared', () => {
    useModelStore.setState({ recentModels: [FIRST!.id] });
    const screen = renderPicker();

    search(screen, 'no-such-model-anywhere');
    expect(screen.getByText(/No models matching/)).toBeTruthy();

    search(screen, '');
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getAllByTestId(`picker-row-${FIRST!.id}`)).toHaveLength(1);
  });
});

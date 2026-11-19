import { useEffect, useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, Pressable, View } from 'react-native';
import {
  BaseNavigationContainer,
  StackRouter,
  createNavigationContainerRef,
  createNavigatorFactory,
  useNavigationBuilder,
  type ParamListBase,
} from '@react-navigation/native';
import { Text } from '@/components/ui/Text';
import { TextScaleBoundary } from '@/src/shared/components/TextScaleBoundary';

function TestStackNavigator({
  initialRouteName,
  children,
}: {
  initialRouteName: string;
  children: ReactNode;
}) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
    initialRouteName,
    children,
  });
  const focused = state.routes[state.index];
  return (
    <NavigationContent>{focused ? descriptors[focused.key]?.render() : null}</NavigationContent>
  );
}

const Stack = createNavigatorFactory(TestStackNavigator)();

let labelMounts = 0;

function LabelMountProbe() {
  useEffect(() => {
    labelMounts += 1;
  }, []);
  return null;
}

function HomeScreen() {
  return <Text>Home</Text>;
}

function DetailScreen() {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <View testID="detail-screen">
      <Text>
        <LabelMountProbe />
        Conversation detail
      </Text>
      <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)}>
        <Text>Open sheet</Text>
      </Pressable>
      {sheetOpen ? <Text>Sheet is open</Text> : null}
    </View>
  );
}

const navigation = createNavigationContainerRef<ParamListBase>();

function App() {
  return (
    <BaseNavigationContainer ref={navigation}>
      <TextScaleBoundary>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Detail" component={DetailScreen} />
        </Stack.Navigator>
      </TextScaleBoundary>
    </BaseNavigationContainer>
  );
}

const startingWindow = Dimensions.get('window');

function setWindow(next: Partial<typeof startingWindow>) {
  const window = { ...Dimensions.get('window'), ...next };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
}

beforeEach(() => {
  labelMounts = 0;
});

afterEach(() => {
  setWindow(startingWindow);
});

describe('a text-size change while the app is open', () => {
  it('keeps the person on the screen they navigated to', () => {
    render(<App />);
    act(() => navigation.navigate('Detail'));
    expect(screen.getByTestId('detail-screen')).toBeTruthy();
    const stateBefore = navigation.getRootState();

    setWindow({ fontScale: startingWindow.fontScale + 0.5 });

    expect(screen.getByTestId('detail-screen')).toBeTruthy();
    expect(screen.queryByText('Home')).toBeNull();
    expect(navigation.getCurrentRoute()?.name).toBe('Detail');
    expect(navigation.getRootState()).toEqual(stateBefore);
  });

  it('keeps what the person had open on that screen', () => {
    render(<App />);
    act(() => navigation.navigate('Detail'));
    fireEvent.press(screen.getByText('Open sheet'));
    expect(screen.getByText('Sheet is open')).toBeTruthy();

    setWindow({ fontScale: startingWindow.fontScale + 0.5 });

    expect(screen.getByText('Sheet is open')).toBeTruthy();
  });

  it('measures each label again at the new scale', () => {
    render(<App />);
    act(() => navigation.navigate('Detail'));
    expect(labelMounts).toBe(1);

    setWindow({ fontScale: startingWindow.fontScale + 0.5 });

    expect(labelMounts).toBe(2);
    expect(screen.getByText('Conversation detail')).toBeTruthy();
  });

  it('leaves labels alone when only the window size changes', () => {
    render(<App />);
    act(() => navigation.navigate('Detail'));

    setWindow({ width: startingWindow.width + 100 });

    expect(labelMounts).toBe(1);
  });
});

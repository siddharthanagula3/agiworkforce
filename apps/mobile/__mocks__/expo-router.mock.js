/**
 * The full expo-router surface every suite starts from. Spread it first and put
 * the suite's own stubs after it, so a component that reaches for a router hook
 * the suite never thought about gets a working one instead of `undefined`.
 */
const React = require('react');

function createRouter() {
  return {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => false),
    canDismiss: jest.fn(() => false),
    setParams: jest.fn(),
    reload: jest.fn(),
    prefetch: jest.fn(),
  };
}

function createNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    dispatch: jest.fn(),
    reset: jest.fn(),
    setOptions: jest.fn(),
    setParams: jest.fn(),
    openDrawer: jest.fn(),
    closeDrawer: jest.fn(),
    toggleDrawer: jest.fn(),
    isFocused: jest.fn(() => true),
    canGoBack: jest.fn(() => false),
    getParent: jest.fn(() => null),
    getState: jest.fn(() => ({ routes: [], index: 0 })),
    addListener: jest.fn(() => jest.fn()),
    removeListener: jest.fn(),
  };
}

function passthrough(displayName) {
  const Component = ({ children }) => children ?? null;
  Component.displayName = displayName;
  return Component;
}

function navigatorComponent(displayName) {
  const Component = passthrough(displayName);
  Component.Screen = () => null;
  Component.Screen.displayName = `${displayName}.Screen`;
  return Component;
}

function expoRouterMock(overrides = {}) {
  const router = createRouter();
  const navigation = createNavigation();

  return {
    __esModule: true,
    router,
    useRouter: () => router,
    useNavigation: () => navigation,
    useFocusEffect: (callback) => {
      React.useEffect(() => callback(), [callback]);
    },
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    useSearchParams: () => ({}),
    useSegments: () => [],
    usePathname: () => '/',
    useRootNavigationState: () => ({ key: 'root', routes: [], index: 0 }),
    useNavigationContainerRef: () => ({ current: null }),
    Redirect: () => null,
    Link: passthrough('Link'),
    Slot: passthrough('Slot'),
    Stack: navigatorComponent('Stack'),
    Tabs: navigatorComponent('Tabs'),
    Drawer: navigatorComponent('Drawer'),
    SplashScreen: {
      preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
      hideAsync: jest.fn().mockResolvedValue(undefined),
      setOptions: jest.fn(),
    },
    withLayoutContext: (Navigator) => Navigator,
    ...overrides,
  };
}

module.exports = { expoRouterMock, createRouter, createNavigation };

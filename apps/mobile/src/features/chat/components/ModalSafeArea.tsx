import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

interface ModalSafeAreaProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
  testID?: string;
}

function InsetFrame({ children, style, edges = ALL_EDGES, testID }: ModalSafeAreaProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        style,
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingRight: edges.includes('right') ? insets.right : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          paddingLeft: edges.includes('left') ? insets.left : 0,
        },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A Modal is a separate native window, so a SafeAreaView inside it never finds
 * the app's provider and reads zero insets. Its own provider measures the
 * modal's window, rotation included.
 */
export function ModalSafeArea(props: ModalSafeAreaProps) {
  return (
    <SafeAreaProvider>
      <InsetFrame {...props} />
    </SafeAreaProvider>
  );
}

/**
 * presentationStyle="pageSheet" exists only on iOS, where UIKit already keeps
 * the sheet clear of the status bar. Everywhere else the same Modal is a full
 * edge-to-edge window that has to pad itself.
 */
export function PageSheetSafeArea({ children, style, testID }: Omit<ModalSafeAreaProps, 'edges'>) {
  if (Platform.OS === 'ios') {
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  }
  return (
    <ModalSafeArea testID={testID} style={style}>
      {children}
    </ModalSafeArea>
  );
}

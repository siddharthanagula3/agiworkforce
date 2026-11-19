import { useContext, useEffect } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';

/**
 * A full-screen viewer is a Modal above every route, so a link that opens
 * another screen behind it leaves it covering that screen unless it closes
 * when its own screen loses focus.
 */
export function useDismissOnScreenBlur(visible: boolean, dismiss: () => void): void {
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!visible || !navigation) return;
    return navigation.addListener('blur', dismiss);
  }, [dismiss, navigation, visible]);
}

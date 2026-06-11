import { DrawerActions } from '@react-navigation/native';

type DrawerAction = ReturnType<typeof DrawerActions.openDrawer>;

type DrawerNavigationLike = {
  dispatch: (action: DrawerAction) => void;
  getParent?: () => DrawerNavigationLike | undefined;
  getState?: () => { type?: string } | undefined;
};

export function openNearestDrawer(navigation: DrawerNavigationLike) {
  let current: DrawerNavigationLike | undefined = navigation;
  let root = current;

  while (current) {
    const state = current.getState?.();
    if (state?.type === 'drawer') {
      current.dispatch(DrawerActions.openDrawer());
      return;
    }

    const parent: DrawerNavigationLike | undefined = current.getParent?.();
    if (!parent) break;
    root = parent;
    current = parent;
  }

  root?.dispatch(DrawerActions.openDrawer());
}

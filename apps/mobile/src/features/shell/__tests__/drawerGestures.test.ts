import {
  ANDROID_DRAWER_SWIPE_MIN_DISTANCE,
  ANDROID_SYSTEM_BACK_EDGE_WIDTH,
  DRAWER_SWIPE_EDGE_WIDTH,
  DRAWER_SWIPE_MIN_DISTANCE,
  drawerGestureOptions,
  isDrawerOpen,
} from '../drawerGestures';

describe('drawerGestureOptions', () => {
  it('hands the whole edge back to the content when the drawer is permanent', () => {
    const options = drawerGestureOptions({ usesPersistentDrawer: true, platform: 'ios' });

    expect(options).toMatchObject({
      drawerType: 'permanent',
      swipeEnabled: false,
      swipeEdgeWidth: 0,
    });
  });

  it('starts the Android swipe band past the system back gesture', () => {
    const android = drawerGestureOptions({ usesPersistentDrawer: false, platform: 'android' });

    expect(android.swipeEdgeWidth).toBe(DRAWER_SWIPE_EDGE_WIDTH + ANDROID_SYSTEM_BACK_EDGE_WIDTH);
    expect(android.swipeEdgeWidth).toBeGreaterThan(ANDROID_SYSTEM_BACK_EDGE_WIDTH);
    expect(android.swipeMinDistance).toBe(ANDROID_DRAWER_SWIPE_MIN_DISTANCE);
    expect(android.swipeMinDistance).toBeGreaterThan(DRAWER_SWIPE_MIN_DISTANCE);
  });

  it('keeps the iOS band at the edge width the drawer already used', () => {
    const ios = drawerGestureOptions({ usesPersistentDrawer: false, platform: 'ios' });

    expect(ios).toMatchObject({
      drawerType: 'front',
      swipeEnabled: true,
      swipeEdgeWidth: DRAWER_SWIPE_EDGE_WIDTH,
      swipeMinDistance: DRAWER_SWIPE_MIN_DISTANCE,
    });
  });
});

describe('isDrawerOpen', () => {
  it('reads the open drawer out of the navigation history', () => {
    expect(
      isDrawerOpen({
        history: [
          { type: 'route', key: 'chats' },
          { type: 'drawer', status: 'open' },
        ],
      } as never),
    ).toBe(true);
  });

  it('is closed for a state with no drawer entry and no default', () => {
    expect(isDrawerOpen({ history: [{ type: 'route', key: 'chats' }] } as never)).toBe(false);
  });

  it('is closed rather than throwing when no state has arrived yet', () => {
    expect(isDrawerOpen(undefined)).toBe(false);
  });
});

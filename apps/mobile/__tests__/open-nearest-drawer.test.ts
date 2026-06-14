import { openNearestDrawer } from '../src/navigation/openNearestDrawer';

function createNavigation(type?: string, parent?: ReturnType<typeof createNavigation>) {
  return {
    dispatch: jest.fn(),
    getParent: jest.fn(() => parent),
    getState: jest.fn(() => (type ? { type } : undefined)),
  };
}

describe('openNearestDrawer', () => {
  it('dispatches on the nearest drawer parent', () => {
    const drawer = createNavigation('drawer');
    const stack = createNavigation('stack', drawer);
    const screen = createNavigation('stack', stack);

    openNearestDrawer(screen);

    expect(screen.dispatch).not.toHaveBeenCalled();
    expect(stack.dispatch).not.toHaveBeenCalled();
    expect(drawer.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_DRAWER' }));
  });

  it('falls back to the root parent when no drawer state is available', () => {
    const root = createNavigation('stack');
    const screen = createNavigation('stack', root);

    openNearestDrawer(screen);

    expect(screen.dispatch).not.toHaveBeenCalled();
    expect(root.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_DRAWER' }));
  });
});

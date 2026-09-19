import { render } from '@testing-library/react-native';
import type { ScrollView } from 'react-native';
import { resetDrawerScrollMemory, useDrawerScrollMemory } from '../useDrawerScrollMemory';

const scrollTo = jest.fn();

function Harness({ isOpen }: { isOpen: boolean }) {
  const memory = useDrawerScrollMemory(isOpen);
  memory.ref.current = { scrollTo } as unknown as ScrollView;
  if (isOpen) memory.onScroll({ nativeEvent: { contentOffset: { y: 240 } } } as never);
  return null;
}

describe('useDrawerScrollMemory', () => {
  beforeEach(() => {
    resetDrawerScrollMemory();
    scrollTo.mockClear();
  });

  it('restores the offset the last open left behind, across a remount', () => {
    render(<Harness isOpen />).unmount();
    scrollTo.mockClear();

    render(<Harness isOpen />);

    expect(scrollTo).toHaveBeenCalledWith({ y: 240, animated: false });
  });

  it('does not scroll a drawer that was never scrolled', () => {
    render(<Harness isOpen={false} />);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

import { render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { useDrawerDismiss } from '../useDrawerDismiss';

function Harness({ isOpen, close }: { isOpen: boolean; close: () => void }) {
  useDrawerDismiss(isOpen, close);
  return null;
}

describe('useDrawerDismiss', () => {
  it('closes the drawer on back instead of letting the app navigate away', () => {
    const handlers: Array<() => boolean> = [];
    const remove = jest.fn();
    const addEventListener = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        handlers.push(handler as () => boolean);
        return { remove } as never;
      });
    const close = jest.fn();

    const view = render(<Harness isOpen close={close} />);

    expect(handlers).toHaveLength(1);
    expect(handlers[0]?.()).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(remove).toHaveBeenCalled();
    addEventListener.mockRestore();
  });

  it('subscribes to nothing while the drawer is closed', () => {
    const addEventListener = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }) as never);

    render(<Harness isOpen={false} close={jest.fn()} />);

    expect(addEventListener).not.toHaveBeenCalled();
    addEventListener.mockRestore();
  });
});

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopRuntimeError,
  SIMULATOR_UNAVAILABLE_MESSAGES,
  type SimulatorCapture,
  type SimulatorDevice,
  type SimulatorStatus,
} from '@agiworkforce/local-runtime-contract';
type ScanModule0 = typeof import('@/features/desktop-host');

const bootSimulator = vi.fn();
const copySimulatorClipboard = vi.fn();
const deleteSimulatorCapture = vi.fn();
const onSimulatorChanged = vi.fn();
const pressSimulatorHome = vi.fn();
const readSimulatorCapture = vi.fn();
const readSimulatorFrame = vi.fn();
const readSimulatorSettings = vi.fn();
const readSimulatorStatus = vi.fn();
const revealSimulatorCapture = vi.fn();
const sendClipboardToSimulator = vi.fn();
const setSimulatorAppearance = vi.fn();
const setSimulatorStatusBar = vi.fn();
const shutdownSimulator = vi.fn();
const startSimulatorRecording = vi.fn();
const stopSimulatorRecording = vi.fn();
const takeSimulatorScreenshot = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  bootSimulator,
  copySimulatorClipboard,
  deleteSimulatorCapture,
  onSimulatorChanged,
  pressSimulatorHome,
  readSimulatorCapture,
  readSimulatorFrame,
  readSimulatorSettings,
  readSimulatorStatus,
  revealSimulatorCapture,
  sendClipboardToSimulator,
  setSimulatorAppearance,
  setSimulatorStatusBar,
  shutdownSimulator,
  startSimulatorRecording,
  stopSimulatorRecording,
  takeSimulatorScreenshot,
}));

vi.mock('./LocalCaptureAnnotator', async () => {
  const { createElement } = await import('react');
  return {
    LocalCaptureAnnotator: (props: {
      image: string;
      name: string;
      onAdd: (file: File) => void;
      onClose: () => void;
    }) =>
      createElement(
        'div',
        { 'data-testid': 'annotator', 'data-image': props.image },
        createElement(
          'button',
          {
            type: 'button',
            onClick: () => props.onAdd(new File(['marked'], props.name, { type: 'image/png' })),
          },
          'Add marked up capture',
        ),
        createElement('button', { type: 'button', onClick: props.onClose }, 'Leave annotator'),
      ),
  };
});

const { LocalSimulatorPane } = await import('./LocalSimulatorPane');

const FRAME_ALT = 'The live screen of the simulator';
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const START_MS = 1_700_000_000_000;

const PHONE: SimulatorDevice = {
  udid: 'phone-udid',
  name: 'iPhone 17',
  runtime: 'iOS 26.5',
  booted: true,
};
const TABLET: SimulatorDevice = {
  udid: 'tablet-udid',
  name: 'iPad Pro',
  runtime: 'iOS 26.5',
  booted: false,
};

const SHOT: SimulatorCapture = {
  id: 'capture-1',
  kind: 'screenshot',
  path: '/Users/me/Shots/one.png',
  createdAtMs: START_MS,
  bytes: 2048,
};

function statusOf(overrides: Partial<SimulatorStatus> = {}): SimulatorStatus {
  return {
    available: true,
    unavailableReason: null,
    devices: [PHONE],
    recording: null,
    captures: [],
    ...overrides,
  };
}

const toggleExpanded = vi.fn();
const toggleFloating = vi.fn();
const close = vi.fn();

function pane(props: Partial<React.ComponentProps<typeof LocalSimulatorPane>> = {}) {
  return (
    <LocalSimulatorPane
      expanded={false}
      onToggleExpanded={toggleExpanded}
      floating={false}
      onToggleFloating={toggleFloating}
      onClose={close}
      {...props}
    />
  );
}

let emit: (status: SimulatorStatus) => void = () => undefined;
const unsubscribe = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  readSimulatorStatus.mockResolvedValue(statusOf());
  readSimulatorFrame.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,AAAA', takenAtMs: 1 });
  readSimulatorSettings.mockResolvedValue({ appearance: 'light', statusBar: 'live' });
  setSimulatorAppearance.mockResolvedValue({ appearance: 'dark', statusBar: 'live' });
  takeSimulatorScreenshot.mockResolvedValue(SHOT);
  readSimulatorCapture.mockResolvedValue({ dataUrl: PNG_DATA_URL, name: 'one.png' });
  onSimulatorChanged.mockImplementation((listener: (status: SimulatorStatus) => void) => {
    emit = listener;
    return unsubscribe;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function useFakeClock() {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(START_MS);
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderBooted(props: Partial<React.ComponentProps<typeof LocalSimulatorPane>> = {}) {
  const view = render(pane(props));
  await screen.findByRole('img', { name: FRAME_ALT });
  return view;
}

async function openMenu(name: string | RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name }));
  return user;
}

describe('the simulator pane when it cannot show a phone', () => {
  it('explains why the simulator is unavailable and offers only Try again', async () => {
    readSimulatorStatus.mockResolvedValue(
      statusOf({ available: false, unavailableReason: 'xcode-missing', devices: [] }),
    );
    render(pane());

    expect(
      await screen.findByText(SIMULATOR_UNAVAILABLE_MESSAGES['xcode-missing']),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Simulator tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(readSimulatorStatus).toHaveBeenCalledTimes(2);
  });

  it('says the pane needs permission when the read is refused', async () => {
    readSimulatorStatus.mockRejectedValue(
      new DesktopRuntimeError({ code: 'permission-denied', message: 'Denied.' }),
    );
    render(pane());

    expect(
      await screen.findByText(/needs permission to use the iOS Simulator/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/allow it again in Settings/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the message of any other failed read', async () => {
    readSimulatorStatus.mockRejectedValue(
      new DesktopRuntimeError({ code: 'runtime-unavailable', message: 'The runtime is asleep.' }),
    );
    render(pane());

    expect(await screen.findByText('The runtime is asleep.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says where to add a simulator when none is installed', async () => {
    readSimulatorStatus.mockResolvedValue(statusOf({ devices: [] }));
    render(pane());

    expect(await screen.findByText(/No simulators are installed/u)).toBeInTheDocument();
    expect(screen.getByText(/Components/u)).toBeInTheDocument();
  });
});

describe('starting a simulator', () => {
  it('offers Start for a device that is shut down and shows the phone once it boots', async () => {
    readSimulatorStatus.mockResolvedValue(statusOf({ devices: [TABLET] }));
    bootSimulator.mockResolvedValue(statusOf({ devices: [{ ...TABLET, booted: true }] }));
    render(pane());

    expect(await screen.findByText('iPad Pro is not running.')).toBeInTheDocument();
    expect(screen.getByText(/several gigabytes of memory/u)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start simulator' }));

    expect(bootSimulator).toHaveBeenCalledWith('tablet-udid');
    expect(await screen.findByRole('img', { name: FRAME_ALT })).toBeInTheDocument();
    expect(readSimulatorFrame).toHaveBeenCalledWith('tablet-udid');
  });

  it('selects the first running device by default and lets another be chosen', async () => {
    readSimulatorStatus.mockResolvedValue(statusOf({ devices: [TABLET, PHONE] }));
    render(pane());

    const picker = await screen.findByRole('button', { name: /iPhone 17/u });
    expect(readSimulatorFrame).toHaveBeenCalledWith('phone-udid');

    const user = userEvent.setup();
    await user.click(picker);
    const rows = screen.getAllByRole('menuitemradio');
    expect(rows[1]).toHaveTextContent('iPhone 17');
    expect(rows[1]).toHaveTextContent('Running');
    expect(rows[0]).toHaveTextContent('iOS 26.5');
    expect(rows[0]).not.toHaveTextContent('Running');
    await user.click(rows[0] as HTMLElement);

    expect(await screen.findByRole('button', { name: 'Start simulator' })).toBeInTheDocument();
    expect(bootSimulator).not.toHaveBeenCalled();
  });

  it('replaces the device list when the desktop reports a change', async () => {
    await renderBooted();
    expect(screen.getByRole('button', { name: /iPhone 17/u })).toBeInTheDocument();

    act(() => emit(statusOf({ devices: [{ ...TABLET, booted: true }] })));

    expect(await screen.findByRole('button', { name: /iPad Pro/u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /iPhone 17/u })).not.toBeInTheDocument();
  });

  it('stops listening when it unmounts', async () => {
    const { unmount } = await renderBooted();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('the live screen', () => {
  it('shows the frame and asks for the next one on the interval', async () => {
    useFakeClock();
    render(pane());
    await settle();

    expect(screen.getByRole('img', { name: FRAME_ALT })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,AAAA',
    );
    expect(readSimulatorFrame).toHaveBeenCalledTimes(1);
    await advance(500);
    expect(readSimulatorFrame).toHaveBeenCalledTimes(2);
    await advance(500);
    expect(readSimulatorFrame).toHaveBeenCalledTimes(3);
  });

  it('never overlaps calls', async () => {
    useFakeClock();
    let finish: (frame: { dataUrl: string; takenAtMs: number }) => void = () => undefined;
    readSimulatorFrame.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(pane());
    await settle();
    await advance(5000);

    expect(readSimulatorFrame).toHaveBeenCalledTimes(1);
    finish({ dataUrl: 'data:image/jpeg;base64,BBBB', takenAtMs: 2 });
    await settle();
    await advance(500);
    expect(readSimulatorFrame).toHaveBeenCalledTimes(2);
  });

  it('keeps trying every three seconds and says the screen is not updating', async () => {
    useFakeClock();
    readSimulatorFrame.mockRejectedValueOnce(
      new DesktopRuntimeError({ code: 'runtime-unavailable', message: 'The simulator is busy.' }),
    );
    render(pane());
    await settle();

    expect(
      screen.getByText('The screen is not updating. The simulator is busy.'),
    ).toBeInTheDocument();
    await advance(2999);
    expect(readSimulatorFrame).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(readSimulatorFrame).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/The screen is not updating/u)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: FRAME_ALT })).toBeInTheDocument();
  });

  it('stops asking for frames once it unmounts', async () => {
    useFakeClock();
    const { unmount } = render(pane());
    await settle();
    expect(readSimulatorFrame).toHaveBeenCalledTimes(1);

    unmount();
    await advance(10_000);
    expect(readSimulatorFrame).toHaveBeenCalledTimes(1);
  });

  it('stops while a capture is being marked up and resumes after', async () => {
    useFakeClock();
    render(pane({ onAttachImage: vi.fn() }));
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Annotate' }));
    await settle();
    expect(screen.getByTestId('annotator')).toHaveAttribute('data-image', PNG_DATA_URL);
    const callsBefore = readSimulatorFrame.mock.calls.length;
    await advance(5000);
    expect(readSimulatorFrame).toHaveBeenCalledTimes(callsBefore);

    fireEvent.click(screen.getByRole('button', { name: 'Leave annotator' }));
    await settle();
    expect(readSimulatorFrame.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(screen.queryByTestId('annotator')).not.toBeInTheDocument();
  });

  it('adds the marked up file to the chat and closes the annotator', async () => {
    const onAttachImage = vi.fn();
    await renderBooted({ onAttachImage });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Annotate' }));
    await user.click(await screen.findByRole('button', { name: 'Add marked up capture' }));

    expect(onAttachImage).toHaveBeenCalledTimes(1);
    expect(onAttachImage.mock.calls[0]?.[0]).toBeInstanceOf(File);
    expect(screen.queryByTestId('annotator')).not.toBeInTheDocument();
  });
});

describe('the settings menus', () => {
  it('changes the appearance from the Device menu', async () => {
    await renderBooted();
    const user = await openMenu('Device');

    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(setSimulatorAppearance).toHaveBeenCalledWith('phone-udid', 'dark');
    expect(readSimulatorSettings).toHaveBeenCalledTimes(2);
  });

  it('explains the clean status bar and leaves the appearance out when the device cannot say', async () => {
    readSimulatorSettings.mockResolvedValue({ appearance: null, statusBar: 'live' });
    await renderBooted();
    await openMenu('Device');

    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Clean/u })).toHaveTextContent(
      '9:41, full signal and battery',
    );
  });

  it('asks before shutting a simulator down and names the consequence', async () => {
    shutdownSimulator.mockResolvedValue(statusOf({ devices: [{ ...PHONE, booted: false }] }));
    await renderBooted();
    const user = await openMenu('Device');
    await user.click(screen.getByRole('menuitem', { name: 'Shut down' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/apps running in it stop/u);
    expect(dialog).toHaveTextContent(/lost/u);
    expect(shutdownSimulator).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Shut down' }));
    expect(shutdownSimulator).toHaveBeenCalledWith('phone-udid');
    expect(await screen.findByRole('button', { name: 'Start simulator' })).toBeInTheDocument();
  });

  it('reports how many characters moved with the clipboard', async () => {
    copySimulatorClipboard.mockResolvedValue({ characters: 12 });
    sendClipboardToSimulator.mockResolvedValue({ characters: 0 });
    await renderBooted();

    let user = await openMenu('Edit');
    await user.click(
      screen.getByRole('menuitem', { name: "Copy the simulator's clipboard to this Mac" }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Copied 12 characters from the simulator to this Mac.',
    );

    user = await openMenu('Edit');
    await user.click(
      screen.getByRole('menuitem', { name: "Send this Mac's clipboard to the simulator" }),
    );
    expect(
      await screen.findByText("This Mac's clipboard has no text to send."),
    ).toBeInTheDocument();
  });

  it('shows a failed action in one alert line', async () => {
    copySimulatorClipboard.mockRejectedValue(
      new DesktopRuntimeError({ code: 'runtime-unavailable', message: 'The clipboard is locked.' }),
    );
    await renderBooted();
    const user = await openMenu('Edit');
    await user.click(
      screen.getByRole('menuitem', { name: "Copy the simulator's clipboard to this Mac" }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('The clipboard is locked.');
  });

  it('steps the zoom between half and double the fitted size', async () => {
    await renderBooted();
    const phone = screen.getByRole('img', { name: FRAME_ALT }).parentElement as HTMLElement;
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    const user = userEvent.setup();

    expect(phone.style.getPropertyValue('--zoom')).toBe('1');
    await user.click(zoomIn);
    expect(phone.style.getPropertyValue('--zoom')).toBe('1.25');
    for (let step = 0; step < 4; step += 1) await user.click(zoomIn);
    expect(phone.style.getPropertyValue('--zoom')).toBe('2');
    expect(zoomIn).toBeDisabled();
    expect(zoomIn).toHaveAttribute('title', 'Already at the largest size');

    await openMenu('View');
    await user.click(screen.getByRole('menuitem', { name: 'Zoom to fit' }));
    expect(phone.style.getPropertyValue('--zoom')).toBe('1');
    for (let step = 0; step < 2; step += 1) await user.click(zoomOut);
    expect(phone.style.getPropertyValue('--zoom')).toBe('0.5');
    expect(zoomOut).toBeDisabled();
  });
});

describe('the toolbar', () => {
  it('presses Home on the selected device', async () => {
    pressSimulatorHome.mockResolvedValue(true);
    await renderBooted();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Home' }));

    expect(pressSimulatorHome).toHaveBeenCalledWith('phone-udid');
  });

  it('shows a screenshot as the latest capture', async () => {
    await renderBooted();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Screenshot' }));

    expect(takeSimulatorScreenshot).toHaveBeenCalledWith('phone-udid');
    expect(readSimulatorCapture).toHaveBeenCalledWith('capture-1');
    const card = await screen.findByRole('region', { name: 'Latest capture' });
    expect(within(card).getByRole('img', { name: 'The latest screenshot' })).toHaveAttribute(
      'src',
      PNG_DATA_URL,
    );
    expect(card).toHaveTextContent('Screenshot');
  });

  it('shows the running time of a recording and stops it', async () => {
    useFakeClock();
    readSimulatorStatus.mockResolvedValue(
      statusOf({ recording: { udid: 'phone-udid', startedAtMs: START_MS - 65_000 } }),
    );
    stopSimulatorRecording.mockResolvedValue(
      statusOf({
        captures: [{ ...SHOT, id: 'capture-2', kind: 'recording', path: '/Users/me/Shots/a.mov' }],
      }),
    );
    render(pane());
    await settle();

    expect(screen.getByRole('timer')).toHaveTextContent('01:05');
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    await advance(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('01:06');

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    await settle();

    expect(stopSimulatorRecording).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Latest capture' })).toHaveTextContent('Recording');
  });

  it('starts a recording on the selected device', async () => {
    startSimulatorRecording.mockResolvedValue(
      statusOf({ recording: { udid: 'phone-udid', startedAtMs: Date.now() } }),
    );
    await renderBooted();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record' }));

    expect(startSimulatorRecording).toHaveBeenCalledWith('phone-udid');
    expect(await screen.findByRole('timer')).toBeInTheDocument();
  });

  it('leaves out Annotate and every add to chat control when the session cannot take pictures', async () => {
    await renderBooted();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Screenshot' }));
    await screen.findByRole('region', { name: 'Latest capture' });

    expect(screen.queryByRole('button', { name: 'Annotate' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Actions for screenshot/u }));
    expect(screen.getByRole('menuitem', { name: 'Copy path' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Add to chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Annotate' })).not.toBeInTheDocument();
  });
});

describe('captures', () => {
  it('adds a screenshot to the chat as a PNG file', async () => {
    const onAttachImage = vi.fn();
    await renderBooted({ onAttachImage });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Screenshot' }));
    await screen.findByRole('region', { name: 'Latest capture' });
    await user.click(screen.getByRole('button', { name: /^Actions for screenshot/u }));
    await user.click(screen.getByRole('menuitem', { name: 'Add to chat' }));

    expect(onAttachImage).toHaveBeenCalledTimes(1);
    const file = onAttachImage.mock.calls[0]?.[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('one.png');
    expect(file.size).toBe(8);
    expect(await screen.findByText('The screenshot was added to the chat.')).toBeInTheDocument();
  });

  it('asks before deleting a capture and deletes only after the person confirms', async () => {
    deleteSimulatorCapture.mockResolvedValue(statusOf());
    await renderBooted();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Screenshot' }));
    await screen.findByRole('region', { name: 'Latest capture' });

    await user.click(screen.getByRole('button', { name: /^Actions for screenshot/u }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    let dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('removed from this Mac and cannot be brought back');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deleteSimulatorCapture).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Actions for screenshot/u }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteSimulatorCapture).toHaveBeenCalledWith('capture-1');
    expect(await screen.findByText('The capture was deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Latest capture' })).not.toBeInTheDocument();
  });

  it('hides the latest card without touching the file, and reveals it in Finder', async () => {
    revealSimulatorCapture.mockResolvedValue(true);
    await renderBooted();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Screenshot' }));
    await screen.findByRole('region', { name: 'Latest capture' });

    await user.click(screen.getByRole('button', { name: /^Actions for screenshot/u }));
    await user.click(screen.getByRole('menuitem', { name: 'Show in Finder' }));
    expect(revealSimulatorCapture).toHaveBeenCalledWith('capture-1');

    await user.click(screen.getByRole('button', { name: /^Actions for screenshot/u }));
    await user.click(screen.getByRole('menuitem', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Latest capture' })).not.toBeInTheDocument();
    expect(deleteSimulatorCapture).not.toHaveBeenCalled();
  });

  it('lists the saved captures with their kind, time and size', async () => {
    readSimulatorStatus.mockResolvedValue(
      statusOf({
        captures: [
          SHOT,
          { ...SHOT, id: 'capture-3', kind: 'recording', path: '/a.mov', bytes: 3 * 1024 * 1024 },
        ],
      }),
    );
    await renderBooted();

    const summary = screen.getByText('Saved captures (2)');
    expect(summary.tagName).toBe('SUMMARY');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Screenshot');
    expect(rows[0]).toHaveTextContent('2 KB');
    expect(rows[1]).toHaveTextContent('Recording');
    expect(rows[1]).toHaveTextContent('3.0 MB');
    expect(within(rows[0] as HTMLElement).queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('where the pane sits', () => {
  it('reports expanded through aria-pressed and calls its toggle', async () => {
    await renderBooted({ expanded: true });
    const button = screen.getByRole('button', { name: 'Expand to the full width' });

    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(button);
    expect(toggleExpanded).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('local-simulator-pane')).toHaveAccessibleName('iOS Simulator');
  });

  it('reports floating through aria-pressed, calls its toggle and offers no expand', async () => {
    await renderBooted({ floating: true });
    const button = screen.getByRole('button', { name: 'Float over the chat' });

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('button', { name: 'Expand to the full width' }),
    ).not.toBeInTheDocument();
    await userEvent.setup().click(button);
    expect(toggleFloating).toHaveBeenCalledTimes(1);
  });

  it('closes from the header', async () => {
    await renderBooted();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close the simulator' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows only the phone and a small bar in phone only mode', async () => {
    await renderBooted({ floating: true });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show only the phone' }));

    expect(screen.getByRole('img', { name: FRAME_ALT })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved captures/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dock' }));
    expect(toggleFloating).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Show controls' }));
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });
});

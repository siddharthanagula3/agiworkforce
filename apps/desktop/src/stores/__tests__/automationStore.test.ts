// Updated Nov 16, 2025: Fixed test to actually test automationStore instead of JavaScript primitives
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useAutomationStore } from '../automationStore';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

type TauriInvoke = (typeof import('@tauri-apps/api/core'))['invoke'];
type InvokeMock = Mock<Parameters<TauriInvoke>, ReturnType<TauriInvoke>>;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as InvokeMock;
}

describe('automationStore', () => {
  let invokeMock: InvokeMock;

  beforeEach(async () => {
    // Reset store state before each test
    useAutomationStore.getState().reset();

    invokeMock = await getInvokeMock();
    invokeMock.mockReset();
  });

  it('should initialize with default state', () => {
    const state = useAutomationStore.getState();

    expect(state.windows).toEqual([]);
    expect(state.elements).toEqual([]);
    expect(state.loadingWindows).toBe(false);
    expect(state.loadingElements).toBe(false);
    expect(state.runningAction).toBe(false);
    expect(state.error).toBeNull();
    expect(state.isRecording).toBe(false);
    expect(state.isExecuting).toBe(false);
  });

  it('should load windows successfully', async () => {
    const mockWindows = [
      { id: 'window-1', name: 'Test Window 1', handle: 123 },
      { id: 'window-2', name: 'Test Window 2', handle: 456 },
    ];

    invokeMock.mockResolvedValue(mockWindows);

    await useAutomationStore.getState().loadWindows();

    const state = useAutomationStore.getState();
    expect(state.windows).toEqual(mockWindows);
    expect(state.loadingWindows).toBe(false);
    expect(state.error).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('list_automation_windows');
  });

  it('should handle window loading errors', async () => {
    const errorMessage = 'Failed to list windows';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    await expect(useAutomationStore.getState().loadWindows()).rejects.toThrow(errorMessage);

    const state = useAutomationStore.getState();
    expect(state.loadingWindows).toBe(false);
    expect(state.error).toBe(`Error: ${errorMessage}`);
    expect(state.windows).toEqual([]);
  });

  it('should search for elements', async () => {
    const mockElements = [
      { id: 'elem-1', name: 'Button', type: 'Button' },
      { id: 'elem-2', name: 'Input', type: 'Edit' },
    ];

    invokeMock.mockResolvedValue(mockElements);

    const query = { window_id: 'window-1', element_type: 'Button' };
    await useAutomationStore.getState().searchElements(query);

    const state = useAutomationStore.getState();
    expect(state.elements).toEqual(mockElements);
    expect(state.loadingElements).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('find_automation_elements', { query });
  });

  it('should perform click action', async () => {
    invokeMock.mockResolvedValue(undefined);

    const clickRequest = { element_id: 'button-1', x: 100, y: 50 };
    await useAutomationStore.getState().click(clickRequest);

    const state = useAutomationStore.getState();
    expect(state.runningAction).toBe(false);
    expect(state.error).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('click_automation', { request: clickRequest });
  });

  it('should handle click errors', async () => {
    const errorMessage = 'Element not found';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    const clickRequest = { element_id: 'button-1', x: 100, y: 50 };
    await expect(useAutomationStore.getState().click(clickRequest)).rejects.toThrow(errorMessage);

    const state = useAutomationStore.getState();
    expect(state.runningAction).toBe(false);
    expect(state.error).toBe(`Error: ${errorMessage}`);
  });

  it('should type text with options', async () => {
    invokeMock.mockResolvedValue(undefined);

    const text = 'Hello World';
    const options = { elementId: 'input-1', focus: true };
    await useAutomationStore.getState().typeText(text, options);

    const state = useAutomationStore.getState();
    expect(state.runningAction).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('send_keys', { text, options });
  });

  it('should clear error state', () => {
    useAutomationStore.setState({ error: 'Test error' });
    expect(useAutomationStore.getState().error).toBe('Test error');

    useAutomationStore.getState().clearError();
    expect(useAutomationStore.getState().error).toBeNull();
  });

  it('should reset store to initial state', () => {
    // Modify state
    useAutomationStore.setState({
      windows: [{ id: 'w1', name: 'Window', handle: 1 }],
      elements: [{ id: 'e1', name: 'Element', type: 'Button' }],
      error: 'Some error',
      isRecording: true,
      isExecuting: true,
    });

    // Reset
    useAutomationStore.getState().reset();

    const state = useAutomationStore.getState();
    expect(state.windows).toEqual([]);
    expect(state.elements).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.isRecording).toBe(false);
    expect(state.isExecuting).toBe(false);
  });

  it('should activate and deactivate inspector', () => {
    const { activateInspector, deactivateInspector } = useAutomationStore.getState();

    activateInspector();
    expect(useAutomationStore.getState().inspector.isActive).toBe(true);

    deactivateInspector();
    expect(useAutomationStore.getState().inspector.isActive).toBe(false);
  });

  it('should manage recording state', () => {
    const { startRecording, stopRecording } = useAutomationStore.getState();

    startRecording();
    expect(useAutomationStore.getState().isRecording).toBe(true);
    expect(useAutomationStore.getState().currentRecording).toBeNull();

    stopRecording();
    expect(useAutomationStore.getState().isRecording).toBe(false);
  });
});

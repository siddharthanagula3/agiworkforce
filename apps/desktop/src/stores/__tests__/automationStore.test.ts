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
    const mockWindows: any[] = [
      { id: 'w1', name: 'Window 1', class_name: 'Window', control_type: 'Window' },
    ];

    invokeMock.mockResolvedValue(mockWindows);

    await useAutomationStore.getState().loadWindows();

    const state = useAutomationStore.getState();
    expect(state.loadingWindows).toBe(false);
    expect(state.error).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('automation_list_windows', undefined);
  });

  it('should handle window loading errors', async () => {
    const errorMessage = 'Failed to list windows';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    await expect(useAutomationStore.getState().loadWindows()).rejects.toThrow();

    const state = useAutomationStore.getState();
    expect(state.loadingWindows).toBe(false);
    expect(state.error).toContain('Failed to list automation windows');
    expect(state.error).toContain(errorMessage);
    expect(state.windows).toEqual([]);
  });

  it('should search for elements', async () => {
    const mockElements = [
      {
        id: 'elem-1',
        name: 'Button',
        class_name: 'Button',
        control_type: 'Button',
        bounding_rect: { x: 0, y: 0, width: 100, height: 50 },
      },
      {
        id: 'elem-2',
        name: 'Input',
        class_name: 'Edit',
        control_type: 'Edit',
        bounding_rect: { x: 0, y: 60, width: 200, height: 30 },
      },
    ];

    invokeMock.mockResolvedValue(mockElements);

    const query = { window: 'window-1', controlType: 'Button' };
    await useAutomationStore.getState().searchElements(query);

    const state = useAutomationStore.getState();
    expect(state.elements.length).toBe(2);
    expect(state.loadingElements).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('automation_find_elements', {
      request: expect.objectContaining({ control_type: 'Button' }),
    });
  });

  it('should perform click action', async () => {
    invokeMock.mockResolvedValue(undefined);

    const clickRequest = { elementId: 'button-1', x: 100, y: 50 };
    await useAutomationStore.getState().click(clickRequest);

    const state = useAutomationStore.getState();
    expect(state.runningAction).toBe(false);
    expect(state.error).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('automation_click', {
      request: expect.objectContaining({ element_id: 'button-1', x: 100, y: 50 }),
    });
  });

  it('should handle click errors', async () => {
    const errorMessage = 'Element not found';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    const clickRequest = { elementId: 'button-1', x: 100, y: 50 };
    await expect(useAutomationStore.getState().click(clickRequest)).rejects.toThrow();

    const state = useAutomationStore.getState();
    expect(state.runningAction).toBe(false);
    expect(state.error).toContain('Failed to perform automation click');
    expect(state.error).toContain(errorMessage);
  });

  it('should type text with options', async () => {
    invokeMock.mockResolvedValue(undefined);

    const text = 'Hello World';
    const options = { elementId: 'input-1', focus: true };
    await useAutomationStore.getState().typeText(text, options);

    const state = useAutomationStore.getState();
    expect(state.runningAction).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('automation_send_keys', {
      request: expect.objectContaining({ text: 'Hello World', element_id: 'input-1', focus: true }),
    });
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
      windows: [{ id: 'w1', name: 'Window', className: 'Window', controlType: 'Window' }],
      elements: [{ id: 'e1', name: 'Element', className: 'Button', controlType: 'Button' }],
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

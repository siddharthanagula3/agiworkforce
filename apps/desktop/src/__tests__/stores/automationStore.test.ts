import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useAutomationStore } from '../../stores/automationStore';
import type {
  AutomationElementInfo,
  AutomationOcrResult,
  AutomationQuery,
  AutomationScreenshotOptions,
  OverlayTypePayload,
} from '../../types/automation';
import type { CaptureResult } from '../../types/capture';

// AUDIT-P3-TEST-TYPE: Properly typed mock functions for automation API
vi.mock('../../api/automation', () => ({
  listAutomationWindows: vi.fn(),
  findAutomationElements: vi.fn(),
  clickAutomation: vi.fn(),
  sendKeys: vi.fn(),
  sendHotkey: vi.fn(),
  automationScreenshot: vi.fn(),
  automationOcr: vi.fn(),
  emitOverlayClick: vi.fn(),
  emitOverlayType: vi.fn(),
  emitOverlayRegion: vi.fn(),
  replayOverlayEvents: vi.fn(),
}));

// AUDIT-P3-TEST-TYPE: Type-safe mock accessor for automation API functions
type AutomationApiMocks = {
  listAutomationWindows: Mock<() => Promise<AutomationElementInfo[]>>;
  findAutomationElements: Mock<(query: AutomationQuery) => Promise<AutomationElementInfo[]>>;
  clickAutomation: Mock<() => Promise<void>>;
  sendKeys: Mock<(text: string, options?: Record<string, unknown>) => Promise<void>>;
  sendHotkey: Mock<(key: number, modifiers: string[]) => Promise<void>>;
  automationScreenshot: Mock<(options?: AutomationScreenshotOptions) => Promise<CaptureResult>>;
  automationOcr: Mock<(imagePath: string) => Promise<AutomationOcrResult>>;
  emitOverlayClick: Mock<() => Promise<void>>;
  emitOverlayType: Mock<(payload: OverlayTypePayload) => Promise<void>>;
  emitOverlayRegion: Mock<() => Promise<void>>;
  replayOverlayEvents: Mock<(limit?: number) => Promise<void>>;
};

async function getAutomationMocks(): Promise<AutomationApiMocks> {
  const api = await import('../../api/automation');
  return api as unknown as AutomationApiMocks;
}

describe('automationStore', () => {
  beforeEach(() => {
    useAutomationStore.setState({
      windows: [],
      elements: [],
      loadingWindows: false,
      loadingElements: false,
      runningAction: false,
      error: null,
      lastScreenshot: null,
      lastOcr: null,
    });
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAutomationStore.getState();
      expect(state.windows).toEqual([]);
      expect(state.elements).toEqual([]);
      expect(state.loadingWindows).toBe(false);
      expect(state.loadingElements).toBe(false);
      expect(state.runningAction).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastScreenshot).toBeNull();
      expect(state.lastOcr).toBeNull();
    });
  });

  describe('Window Management', () => {
    it('should load automation windows', async () => {
      const mockWindows: AutomationElementInfo[] = [
        {
          id: 'window1',
          name: 'Test Window',
          className: 'WindowClass1',
          controlType: 'window',
          boundingRect: {
            left: 0,
            top: 0,
            width: 800,
            height: 600,
          },
        },
        {
          id: 'window2',
          name: 'Another Window',
          className: 'WindowClass2',
          controlType: 'window',
          boundingRect: {
            left: 100,
            top: 100,
            width: 1024,
            height: 768,
          },
        },
      ];

      const mocks = await getAutomationMocks();
      mocks.listAutomationWindows.mockResolvedValue(mockWindows);

      await useAutomationStore.getState().loadWindows();

      const state = useAutomationStore.getState();
      expect(state.windows).toHaveLength(2);
      expect(state.windows[0]?.name).toBe('Test Window');
      expect(state.windows[1]?.name).toBe('Another Window');
      expect(state.loadingWindows).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle window load error', async () => {
      const mocks = await getAutomationMocks();
      mocks.listAutomationWindows.mockRejectedValue(new Error('Failed to enumerate windows'));

      await expect(useAutomationStore.getState().loadWindows()).rejects.toThrow(
        'Failed to enumerate windows',
      );

      const state = useAutomationStore.getState();
      expect(state.windows).toEqual([]);
      expect(state.error).toBe('Error: Failed to enumerate windows');
      expect(state.loadingWindows).toBe(false);
    });
  });

  describe('Element Search', () => {
    it('should search for automation elements', async () => {
      const query: AutomationQuery = {
        name: 'Submit Button',
        controlType: 'button',
      };

      const mockElements: AutomationElementInfo[] = [
        {
          id: 'btn1',
          name: 'Submit Button',
          className: 'ButtonClass',
          controlType: 'button',
          boundingRect: {
            left: 100,
            top: 200,
            width: 120,
            height: 40,
          },
        },
      ];

      const mocks = await getAutomationMocks();
      mocks.findAutomationElements.mockResolvedValue(mockElements);

      await useAutomationStore.getState().searchElements(query);

      const state = useAutomationStore.getState();
      expect(state.elements).toHaveLength(1);
      expect(state.elements[0]?.name).toBe('Submit Button');
      expect(state.elements[0]?.controlType).toBe('button');
      expect(state.loadingElements).toBe(false);
    });

    it('should handle element search error', async () => {
      const query: AutomationQuery = {
        name: 'Nonexistent Element',
      };

      const mocks = await getAutomationMocks();
      mocks.findAutomationElements.mockRejectedValue(new Error('Element not found'));

      await useAutomationStore.getState().searchElements(query);

      const state = useAutomationStore.getState();
      expect(state.elements).toEqual([]);
      expect(state.error).toContain('Element not found');
      expect(state.loadingElements).toBe(false);
    });
  });

  describe('Click Action', () => {
    it('should perform click at coordinates', async () => {
      const clickRequest = {
        x: 100,
        y: 200,
        button: 'left' as const,
      };

      const mocks = await getAutomationMocks();
      mocks.clickAutomation.mockResolvedValue(undefined);

      await useAutomationStore.getState().click(clickRequest);

      expect(mocks.clickAutomation).toHaveBeenCalledWith(clickRequest);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should perform click on element', async () => {
      const clickRequest = {
        elementId: 'btn1',
        button: 'left' as const,
      };

      const mocks = await getAutomationMocks();
      mocks.clickAutomation.mockResolvedValue(undefined);

      await useAutomationStore.getState().click(clickRequest);

      expect(mocks.clickAutomation).toHaveBeenCalledWith(clickRequest);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
    });

    it('should handle click error', async () => {
      const clickRequest = {
        x: 100,
        y: 200,
        button: 'left' as const,
      };

      const mocks = await getAutomationMocks();
      mocks.clickAutomation.mockRejectedValue(new Error('Click failed'));

      await expect(useAutomationStore.getState().click(clickRequest)).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toContain('Click failed');
      expect(state.runningAction).toBe(false);
    });
  });

  describe('Type Action', () => {
    it('should type text', async () => {
      const mocks = await getAutomationMocks();
      mocks.sendKeys.mockResolvedValue(undefined);

      await useAutomationStore.getState().typeText('Hello World');

      expect(mocks.sendKeys).toHaveBeenCalledWith('Hello World', undefined);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should type text with element focus', async () => {
      const mocks = await getAutomationMocks();
      mocks.sendKeys.mockResolvedValue(undefined);

      await useAutomationStore.getState().typeText('Test', { elementId: 'input1', focus: true });

      expect(mocks.sendKeys).toHaveBeenCalledWith('Test', { elementId: 'input1', focus: true });
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
    });

    it('should handle type error', async () => {
      const mocks = await getAutomationMocks();
      mocks.sendKeys.mockRejectedValue(new Error('Type failed'));

      await expect(useAutomationStore.getState().typeText('Test')).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toBe('Error: Type failed');
      expect(state.runningAction).toBe(false);
    });
  });

  describe('Hotkey Action', () => {
    it('should send hotkey combination', async () => {
      const mocks = await getAutomationMocks();
      mocks.sendHotkey.mockResolvedValue(undefined);

      await useAutomationStore.getState().hotkey(67, ['ctrl']);

      expect(mocks.sendHotkey).toHaveBeenCalledWith(67, ['ctrl']);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
    });

    it('should handle hotkey error', async () => {
      const mocks = await getAutomationMocks();
      mocks.sendHotkey.mockRejectedValue(new Error('Hotkey failed'));

      await expect(useAutomationStore.getState().hotkey(67, ['ctrl'])).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toBe('Error: Hotkey failed');
    });
  });

  describe('Screenshot', () => {
    it('should capture fullscreen screenshot', async () => {
      const mockCapture: CaptureResult = {
        id: 'capture1',
        path: '/tmp/screenshot.png',
        captureType: 'fullscreen',
        metadata: {
          width: 1920,
          height: 1080,
        },
        createdAt: Date.now(),
      };

      const mocks = await getAutomationMocks();
      mocks.automationScreenshot.mockResolvedValue(mockCapture);

      const result = await useAutomationStore.getState().screenshot();

      expect(result).toEqual(mockCapture);
      const state = useAutomationStore.getState();
      expect(state.lastScreenshot).toEqual(mockCapture);
      expect(state.runningAction).toBe(false);
    });

    it('should capture region screenshot', async () => {
      const options: AutomationScreenshotOptions = {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      };

      const mockCapture: CaptureResult = {
        id: 'capture2',
        path: '/tmp/region.png',
        captureType: 'region',
        metadata: {
          width: 800,
          height: 600,
          region: { x: 0, y: 0, width: 800, height: 600 },
        },
        createdAt: Date.now(),
      };

      const mocks = await getAutomationMocks();
      mocks.automationScreenshot.mockResolvedValue(mockCapture);

      const result = await useAutomationStore.getState().screenshot(options);

      expect(mocks.automationScreenshot).toHaveBeenCalledWith(options);
      expect(result.metadata.width).toBe(800);
      expect(result.metadata.height).toBe(600);
    });

    it('should handle screenshot error', async () => {
      const mocks = await getAutomationMocks();
      mocks.automationScreenshot.mockRejectedValue(new Error('Screenshot failed'));

      await expect(useAutomationStore.getState().screenshot()).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toBe('Error: Screenshot failed');
      expect(state.lastScreenshot).toBeNull();
    });
  });

  describe('OCR', () => {
    it('should perform OCR on image', async () => {
      const mockOcrResult: AutomationOcrResult = {
        text: 'Hello World',
        confidence: 0.95,
      };

      const mocks = await getAutomationMocks();
      mocks.automationOcr.mockResolvedValue(mockOcrResult);

      const result = await useAutomationStore.getState().ocr('/tmp/test.png');

      expect(result.text).toBe('Hello World');
      expect(result.confidence).toBe(0.95);
      const state = useAutomationStore.getState();
      expect(state.lastOcr).toEqual(mockOcrResult);
      expect(state.runningAction).toBe(false);
    });

    it('should handle OCR error', async () => {
      const mocks = await getAutomationMocks();
      mocks.automationOcr.mockRejectedValue(new Error('OCR failed'));

      await expect(useAutomationStore.getState().ocr('/tmp/test.png')).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toBe('Error: OCR failed');
      expect(state.lastOcr).toBeNull();
    });
  });

  describe('Overlay Events', () => {
    it('should emit overlay click event', async () => {
      const payload = {
        x: 100,
        y: 200,
        button: 'left' as const,
        timestamp: Date.now(),
      };

      const mocks = await getAutomationMocks();
      mocks.emitOverlayClick.mockResolvedValue(undefined);

      await useAutomationStore.getState().emitOverlayClick(payload);

      expect(mocks.emitOverlayClick).toHaveBeenCalledWith(payload);
    });

    it('should emit overlay type event', async () => {
      const payload: OverlayTypePayload = {
        x: 100,
        y: 200,
        text: 'Test input',
      };

      const mocks = await getAutomationMocks();
      mocks.emitOverlayType.mockResolvedValue(undefined);

      await useAutomationStore.getState().emitOverlayType(payload);

      expect(mocks.emitOverlayType).toHaveBeenCalledWith(payload);
    });

    it('should emit overlay region event', async () => {
      const payload = {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        action: 'select' as const,
        timestamp: Date.now(),
      };

      const mocks = await getAutomationMocks();
      mocks.emitOverlayRegion.mockResolvedValue(undefined);

      await useAutomationStore.getState().emitOverlayRegion(payload);

      expect(mocks.emitOverlayRegion).toHaveBeenCalledWith(payload);
    });

    it('should replay overlay events', async () => {
      const mocks = await getAutomationMocks();
      mocks.replayOverlayEvents.mockResolvedValue(undefined);

      await useAutomationStore.getState().replayOverlay(10);

      expect(mocks.replayOverlayEvents).toHaveBeenCalledWith(10);
    });
  });

  describe('Error Management', () => {
    it('should clear error', () => {
      useAutomationStore.setState({ error: 'Test error' });

      useAutomationStore.getState().clearError();

      const state = useAutomationStore.getState();
      expect(state.error).toBeNull();
    });

    it('should not clear if no error exists', () => {
      useAutomationStore.setState({ error: null });

      useAutomationStore.getState().clearError();

      const state = useAutomationStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('Store Reset', () => {
    it('should reset store to initial state', () => {
      useAutomationStore.setState({
        windows: [
          {
            id: 'window1',
            name: 'Test',
            className: 'WindowClass',
            controlType: 'window',
            boundingRect: {
              left: 0,
              top: 0,
              width: 800,
              height: 600,
            },
          },
        ],
        elements: [
          {
            id: 'btn1',
            name: 'Button',
            className: 'ButtonClass',
            controlType: 'button',
            boundingRect: {
              left: 100,
              top: 200,
              width: 120,
              height: 40,
            },
          },
        ],
        error: 'Some error',
        lastScreenshot: {
          id: 'capture3',
          path: '/tmp/test.png',
          captureType: 'fullscreen',
          metadata: {
            width: 800,
            height: 600,
          },
          createdAt: Date.now(),
        },
      });

      useAutomationStore.getState().reset();

      const state = useAutomationStore.getState();
      expect(state.windows).toEqual([]);
      expect(state.elements).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.lastScreenshot).toBeNull();
      expect(state.lastOcr).toBeNull();
    });
  });

  describe('Loading States', () => {
    it('should set loadingWindows while loading', async () => {
      const mocks = await getAutomationMocks();
      // AUDIT-P3-TEST-TYPE: Use proper typed resolve function
      let resolvePromise: (value: AutomationElementInfo[]) => void;
      const promise = new Promise<AutomationElementInfo[]>((resolve) => {
        resolvePromise = resolve;
      });
      mocks.listAutomationWindows.mockReturnValue(promise);

      const loadPromise = useAutomationStore.getState().loadWindows();

      expect(useAutomationStore.getState().loadingWindows).toBe(true);

      resolvePromise!([]);
      await loadPromise;

      expect(useAutomationStore.getState().loadingWindows).toBe(false);
    });

    it('should set loadingElements while searching', async () => {
      const mocks = await getAutomationMocks();
      // AUDIT-P3-TEST-TYPE: Use proper typed resolve function
      let resolvePromise: (value: AutomationElementInfo[]) => void;
      const promise = new Promise<AutomationElementInfo[]>((resolve) => {
        resolvePromise = resolve;
      });
      mocks.findAutomationElements.mockReturnValue(promise);

      const searchPromise = useAutomationStore.getState().searchElements({ name: 'Test' });

      expect(useAutomationStore.getState().loadingElements).toBe(true);

      resolvePromise!([]);
      await searchPromise;

      expect(useAutomationStore.getState().loadingElements).toBe(false);
    });

    it('should set runningAction during actions', async () => {
      const mocks = await getAutomationMocks();
      // AUDIT-P3-TEST-TYPE: Use proper typed resolve function
      let resolvePromise: (value: void) => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      mocks.clickAutomation.mockReturnValue(promise);

      const clickPromise = useAutomationStore.getState().click({ x: 100, y: 200, button: 'left' });

      expect(useAutomationStore.getState().runningAction).toBe(true);

      resolvePromise!();
      await clickPromise;

      expect(useAutomationStore.getState().runningAction).toBe(false);
    });
  });
});

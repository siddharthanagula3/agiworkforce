/**
 * Comprehensive tests for automationStore
 * Tests UI automation state management, actions, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAutomationStore } from '../../stores/automationStore';
import type {
  AutomationElementInfo,
  AutomationOcrResult,
  AutomationQuery,
} from '../../types/automation';
import type { CaptureResult } from '../../types/capture';

// Mock automation API
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

describe('automationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
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
          type: 'window',
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          visible: true,
          enabled: true,
        },
        {
          id: 'window2',
          name: 'Another Window',
          type: 'window',
          x: 100,
          y: 100,
          width: 1024,
          height: 768,
          visible: true,
          enabled: true,
        },
      ];

      const { listAutomationWindows } = await import('../../api/automation');
      (listAutomationWindows as any).mockResolvedValue(mockWindows);

      await useAutomationStore.getState().loadWindows();

      const state = useAutomationStore.getState();
      expect(state.windows).toHaveLength(2);
      expect(state.windows[0].name).toBe('Test Window');
      expect(state.windows[1].name).toBe('Another Window');
      expect(state.loadingWindows).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle window load error', async () => {
      const { listAutomationWindows } = await import('../../api/automation');
      (listAutomationWindows as any).mockRejectedValue(new Error('Failed to enumerate windows'));

      await useAutomationStore.getState().loadWindows();

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
        type: 'button',
      };

      const mockElements: AutomationElementInfo[] = [
        {
          id: 'btn1',
          name: 'Submit Button',
          type: 'button',
          x: 100,
          y: 200,
          width: 120,
          height: 40,
          visible: true,
          enabled: true,
        },
      ];

      const { findAutomationElements } = await import('../../api/automation');
      (findAutomationElements as any).mockResolvedValue(mockElements);

      await useAutomationStore.getState().searchElements(query);

      const state = useAutomationStore.getState();
      expect(state.elements).toHaveLength(1);
      expect(state.elements[0].name).toBe('Submit Button');
      expect(state.elements[0].type).toBe('button');
      expect(state.loadingElements).toBe(false);
    });

    it('should handle element search error', async () => {
      const query: AutomationQuery = {
        name: 'Nonexistent Element',
      };

      const { findAutomationElements } = await import('../../api/automation');
      (findAutomationElements as any).mockRejectedValue(new Error('Element not found'));

      await useAutomationStore.getState().searchElements(query);

      const state = useAutomationStore.getState();
      expect(state.elements).toEqual([]);
      expect(state.error).toBe('Error: Element not found');
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

      const { clickAutomation } = await import('../../api/automation');
      (clickAutomation as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().click(clickRequest);

      expect(clickAutomation).toHaveBeenCalledWith(clickRequest);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should perform click on element', async () => {
      const clickRequest = {
        elementId: 'btn1',
        button: 'left' as const,
      };

      const { clickAutomation } = await import('../../api/automation');
      (clickAutomation as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().click(clickRequest);

      expect(clickAutomation).toHaveBeenCalledWith(clickRequest);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
    });

    it('should handle click error', async () => {
      const clickRequest = {
        x: 100,
        y: 200,
        button: 'left' as const,
      };

      const { clickAutomation } = await import('../../api/automation');
      (clickAutomation as any).mockRejectedValue(new Error('Click failed'));

      await expect(useAutomationStore.getState().click(clickRequest)).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toBe('Error: Click failed');
      expect(state.runningAction).toBe(false);
    });
  });

  describe('Type Action', () => {
    it('should type text', async () => {
      const { sendKeys } = await import('../../api/automation');
      (sendKeys as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().typeText('Hello World');

      expect(sendKeys).toHaveBeenCalledWith('Hello World', undefined);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should type text with element focus', async () => {
      const { sendKeys } = await import('../../api/automation');
      (sendKeys as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().typeText('Test', { elementId: 'input1', focus: true });

      expect(sendKeys).toHaveBeenCalledWith('Test', { elementId: 'input1', focus: true });
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
    });

    it('should handle type error', async () => {
      const { sendKeys } = await import('../../api/automation');
      (sendKeys as any).mockRejectedValue(new Error('Type failed'));

      await expect(useAutomationStore.getState().typeText('Test')).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toBe('Error: Type failed');
      expect(state.runningAction).toBe(false);
    });
  });

  describe('Hotkey Action', () => {
    it('should send hotkey combination', async () => {
      const { sendHotkey } = await import('../../api/automation');
      (sendHotkey as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().hotkey(67, ['ctrl']); // Ctrl+C

      expect(sendHotkey).toHaveBeenCalledWith(67, ['ctrl']);
      const state = useAutomationStore.getState();
      expect(state.runningAction).toBe(false);
    });

    it('should handle hotkey error', async () => {
      const { sendHotkey } = await import('../../api/automation');
      (sendHotkey as any).mockRejectedValue(new Error('Hotkey failed'));

      await expect(useAutomationStore.getState().hotkey(67, ['ctrl'])).rejects.toThrow();

      const state = useAutomationStore.getState();
      expect(state.error).toBe('Error: Hotkey failed');
    });
  });

  describe('Screenshot', () => {
    it('should capture fullscreen screenshot', async () => {
      const mockCapture: CaptureResult = {
        path: '/tmp/screenshot.png',
        width: 1920,
        height: 1080,
        format: 'png',
        timestamp: Date.now(),
      };

      const { automationScreenshot } = await import('../../api/automation');
      (automationScreenshot as any).mockResolvedValue(mockCapture);

      const result = await useAutomationStore.getState().screenshot();

      expect(result).toEqual(mockCapture);
      const state = useAutomationStore.getState();
      expect(state.lastScreenshot).toEqual(mockCapture);
      expect(state.runningAction).toBe(false);
    });

    it('should capture region screenshot', async () => {
      const options = {
        region: { x: 0, y: 0, width: 800, height: 600 },
      };

      const mockCapture: CaptureResult = {
        path: '/tmp/region.png',
        width: 800,
        height: 600,
        format: 'png',
        timestamp: Date.now(),
      };

      const { automationScreenshot } = await import('../../api/automation');
      (automationScreenshot as any).mockResolvedValue(mockCapture);

      const result = await useAutomationStore.getState().screenshot(options);

      expect(automationScreenshot).toHaveBeenCalledWith(options);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('should handle screenshot error', async () => {
      const { automationScreenshot } = await import('../../api/automation');
      (automationScreenshot as any).mockRejectedValue(new Error('Screenshot failed'));

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
        regions: [
          {
            text: 'Hello World',
            confidence: 0.95,
            bbox: { x: 0, y: 0, width: 100, height: 20 },
          },
        ],
      };

      const { automationOcr } = await import('../../api/automation');
      (automationOcr as any).mockResolvedValue(mockOcrResult);

      const result = await useAutomationStore.getState().ocr('/tmp/test.png');

      expect(result.text).toBe('Hello World');
      expect(result.confidence).toBe(0.95);
      const state = useAutomationStore.getState();
      expect(state.lastOcr).toEqual(mockOcrResult);
      expect(state.runningAction).toBe(false);
    });

    it('should handle OCR error', async () => {
      const { automationOcr } = await import('../../api/automation');
      (automationOcr as any).mockRejectedValue(new Error('OCR failed'));

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

      const { emitOverlayClick } = await import('../../api/automation');
      (emitOverlayClick as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().emitOverlayClick(payload);

      expect(emitOverlayClick).toHaveBeenCalledWith(payload);
    });

    it('should emit overlay type event', async () => {
      const payload = {
        text: 'Test input',
        elementId: 'input1',
        timestamp: Date.now(),
      };

      const { emitOverlayType } = await import('../../api/automation');
      (emitOverlayType as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().emitOverlayType(payload);

      expect(emitOverlayType).toHaveBeenCalledWith(payload);
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

      const { emitOverlayRegion } = await import('../../api/automation');
      (emitOverlayRegion as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().emitOverlayRegion(payload);

      expect(emitOverlayRegion).toHaveBeenCalledWith(payload);
    });

    it('should replay overlay events', async () => {
      const { replayOverlayEvents } = await import('../../api/automation');
      (replayOverlayEvents as any).mockResolvedValue(undefined);

      await useAutomationStore.getState().replayOverlay(10);

      expect(replayOverlayEvents).toHaveBeenCalledWith(10);
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
            type: 'window',
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            visible: true,
            enabled: true,
          },
        ],
        elements: [
          {
            id: 'btn1',
            name: 'Button',
            type: 'button',
            x: 100,
            y: 200,
            width: 120,
            height: 40,
            visible: true,
            enabled: true,
          },
        ],
        error: 'Some error',
        lastScreenshot: {
          path: '/tmp/test.png',
          width: 800,
          height: 600,
          format: 'png',
          timestamp: Date.now(),
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
      const { listAutomationWindows } = await import('../../api/automation');
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (listAutomationWindows as any).mockReturnValue(promise);

      const loadPromise = useAutomationStore.getState().loadWindows();

      // Check loading state is true during operation
      expect(useAutomationStore.getState().loadingWindows).toBe(true);

      resolvePromise([]);
      await loadPromise;

      // Check loading state is false after operation
      expect(useAutomationStore.getState().loadingWindows).toBe(false);
    });

    it('should set loadingElements while searching', async () => {
      const { findAutomationElements } = await import('../../api/automation');
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (findAutomationElements as any).mockReturnValue(promise);

      const searchPromise = useAutomationStore.getState().searchElements({ name: 'Test' });

      expect(useAutomationStore.getState().loadingElements).toBe(true);

      resolvePromise([]);
      await searchPromise;

      expect(useAutomationStore.getState().loadingElements).toBe(false);
    });

    it('should set runningAction during actions', async () => {
      const { clickAutomation } = await import('../../api/automation');
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (clickAutomation as any).mockReturnValue(promise);

      const clickPromise = useAutomationStore.getState().click({ x: 100, y: 200, button: 'left' });

      expect(useAutomationStore.getState().runningAction).toBe(true);

      resolvePromise();
      await clickPromise;

      expect(useAutomationStore.getState().runningAction).toBe(false);
    });
  });
});

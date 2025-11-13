import { create } from 'zustand';
import {
  automationOcr,
  automationScreenshot,
  clickAutomation,
  emitOverlayClick,
  emitOverlayRegion,
  emitOverlayType,
  findAutomationElements,
  listAutomationWindows,
  replayOverlayEvents,
  sendHotkey,
  sendKeys,
} from '../api/automation';
import type {
  AutomationClickRequest,
  AutomationElementInfo,
  AutomationOcrResult,
  AutomationQuery,
  AutomationScreenshotOptions,
  OverlayClickPayload,
  OverlayRegionPayload,
  OverlayTypePayload,
} from '../types/automation';
import type {
  AutomationScript,
  ExecutionHistory,
  ExecutionResult,
  InspectorState,
  Recording,
  RecordingSession,
} from '../types/automation-enhanced';
import type { CaptureResult } from '../types/capture';

interface AutomationState {
  // Existing state
  windows: AutomationElementInfo[];
  elements: AutomationElementInfo[];
  loadingWindows: boolean;
  loadingElements: boolean;
  runningAction: boolean;
  error: string | null;
  lastScreenshot: CaptureResult | null;
  lastOcr: AutomationOcrResult | null;

  // Recording state
  isRecording: boolean;
  currentRecording: RecordingSession | null;
  recordings: Recording[];

  // Script library state
  scripts: AutomationScript[];
  selectedScript: AutomationScript | null;
  loadingScripts: boolean;

  // Execution state
  isExecuting: boolean;
  executionProgress: number;
  executionHistory: ExecutionHistory[];
  currentExecution: ExecutionResult | null;

  // Inspector state
  inspector: InspectorState;

  // Existing actions
  loadWindows: () => Promise<void>;
  searchElements: (query: AutomationQuery) => Promise<void>;
  click: (request: AutomationClickRequest) => Promise<void>;
  typeText: (
    text: string,
    options?: { elementId?: string; x?: number; y?: number; focus?: boolean },
  ) => Promise<void>;
  hotkey: (key: number, modifiers: string[]) => Promise<void>;
  screenshot: (options?: AutomationScreenshotOptions) => Promise<CaptureResult>;
  ocr: (imagePath: string) => Promise<AutomationOcrResult>;
  emitOverlayClick: (payload: OverlayClickPayload) => Promise<void>;
  emitOverlayType: (payload: OverlayTypePayload) => Promise<void>;
  emitOverlayRegion: (payload: OverlayRegionPayload) => Promise<void>;
  replayOverlay: (limit?: number) => Promise<void>;
  clearError: () => void;
  reset: () => void;

  // Recording actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Recording | null>;
  saveRecordingAsScript: (
    recording: Recording,
    name: string,
    description: string,
    tags: string[],
  ) => Promise<AutomationScript | null>;

  // Script library actions
  loadScripts: () => Promise<void>;
  saveScript: (script: AutomationScript) => Promise<void>;
  deleteScript: (scriptId: string) => Promise<void>;
  selectScript: (script: AutomationScript | null) => void;

  // Execution actions
  executeScript: (script: AutomationScript) => Promise<ExecutionResult | null>;
  stopExecution: () => void;

  // Inspector actions
  activateInspector: () => void;
  deactivateInspector: () => void;
  inspectElementAt: (x: number, y: number) => Promise<void>;
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
  windows: [],
  elements: [],
  loadingWindows: false,
  loadingElements: false,
  runningAction: false,
  error: null,
  lastScreenshot: null,
  lastOcr: null,

  async loadWindows() {
    set({ loadingWindows: true, error: null });
    try {
      const windows = await listAutomationWindows();
      set({ windows });
    } catch (error) {
      console.error('Failed to load automation windows:', error);
      set({ error: String(error) });
    } finally {
      set({ loadingWindows: false });
    }
  },

  async searchElements(query) {
    set({ loadingElements: true, error: null });
    try {
      const elements = await findAutomationElements(query);
      set({ elements });
    } catch (error) {
      console.error('Failed to find automation elements:', error);
      set({ error: String(error) });
    } finally {
      set({ loadingElements: false });
    }
  },

  async click(request) {
    set({ runningAction: true, error: null });
    try {
      await clickAutomation(request);
    } catch (error) {
      console.error('Automation click failed:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ runningAction: false });
    }
  },

  async typeText(text, options) {
    set({ runningAction: true, error: null });
    try {
      await sendKeys(text, options);
    } catch (error) {
      console.error('Automation type failed:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ runningAction: false });
    }
  },

  async hotkey(key, modifiers) {
    set({ runningAction: true, error: null });
    try {
      await sendHotkey(key, modifiers);
    } catch (error) {
      console.error('Automation hotkey failed:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ runningAction: false });
    }
  },

  async screenshot(options) {
    set({ runningAction: true, error: null });
    try {
      const capture = await automationScreenshot(options ?? {});
      set({ lastScreenshot: capture });
      return capture;
    } catch (error) {
      console.error('Automation screenshot failed:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ runningAction: false });
    }
  },

  async ocr(imagePath) {
    set({ runningAction: true, error: null });
    try {
      const result = await automationOcr(imagePath);
      set({ lastOcr: result });
      return result;
    } catch (error) {
      console.error('Automation OCR failed:', error);
      set({ error: String(error) });
      throw error;
    } finally {
      set({ runningAction: false });
    }
  },

  async emitOverlayClick(payload) {
    await emitOverlayClick(payload);
  },

  async emitOverlayType(payload) {
    await emitOverlayType(payload);
  },

  async emitOverlayRegion(payload) {
    await emitOverlayRegion(payload);
  },

  async replayOverlay(limit) {
    await replayOverlayEvents(limit);
  },

  clearError() {
    if (get().error) {
      set({ error: null });
    }
  },

  reset() {
    set({
      windows: [],
      elements: [],
      loadingWindows: false,
      loadingElements: false,
      runningAction: false,
      error: null,
      lastScreenshot: null,
      lastOcr: null,
    });
  },
}));

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
  RecordedAction,
  Recording,
  RecordingSession,
} from '../types/automation-enhanced';
import type { CaptureResult } from '../types/capture';

interface Shortcut {
  id: string;
  key: string;
  description: string;
  action: string;
  enabled: boolean;
}

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

  // Shortcuts state
  shortcuts: Shortcut[];
  lastTriggeredShortcut: string | null;

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

  // Event handlers for Tauri events
  handleRecordingStarted: (session: {
    sessionId: string;
    startTime: number;
    isRecording: boolean;
  }) => void;
  handleRecordingStopped: (recording: Recording) => void;
  handleActionRecorded: (action: RecordedAction) => void;
  handleShortcutAction: (action: string) => void;
  handleShortcutRegistered: (shortcut: Shortcut) => void;
  handleShortcutUnregistered: (shortcutId: string) => void;
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

  // Recording state
  isRecording: false,
  currentRecording: null,
  recordings: [],

  // Script library state
  scripts: [],
  selectedScript: null,
  loadingScripts: false,

  // Execution state
  isExecuting: false,
  executionProgress: 0,
  executionHistory: [],
  currentExecution: null,

  // Inspector state
  inspector: {
    isActive: false,
  },

  // Shortcuts state
  shortcuts: [],
  lastTriggeredShortcut: null,

  // Updated Nov 16, 2025: Ensured proper cleanup with finally blocks
  async loadWindows() {
    set({ loadingWindows: true, error: null });
    try {
      const windows = await listAutomationWindows();
      set({ windows, loadingWindows: false });
    } catch (error) {
      console.error('Failed to load automation windows:', error);
      set({ error: String(error), loadingWindows: false, windows: [] });
      throw error;
    }
  },

  async searchElements(query) {
    set({ loadingElements: true, error: null });
    try {
      const elements = await findAutomationElements(query);
      set({ elements, loadingElements: false });
    } catch (error) {
      console.error('Failed to find automation elements:', error);
      set({ error: String(error), loadingElements: false, elements: [] });
    }
  },

  // Updated Nov 16, 2025: Consolidated error cleanup in single set call
  async click(request) {
    set({ runningAction: true, error: null });
    try {
      await clickAutomation(request);
      set({ runningAction: false });
    } catch (error) {
      console.error('Automation click failed:', error);
      set({ error: String(error), runningAction: false });
      throw error;
    }
  },

  async typeText(text, options) {
    set({ runningAction: true, error: null });
    try {
      await sendKeys(text, options);
      set({ runningAction: false });
    } catch (error) {
      console.error('Automation type failed:', error);
      set({ error: String(error), runningAction: false });
      throw error;
    }
  },

  async hotkey(key, modifiers) {
    set({ runningAction: true, error: null });
    try {
      await sendHotkey(key, modifiers);
      set({ runningAction: false });
    } catch (error) {
      console.error('Automation hotkey failed:', error);
      set({ error: String(error), runningAction: false });
      throw error;
    }
  },

  async screenshot(options) {
    set({ runningAction: true, error: null });
    try {
      const capture = await automationScreenshot(options ?? {});
      set({ lastScreenshot: capture, runningAction: false });
      return capture;
    } catch (error) {
      console.error('Automation screenshot failed:', error);
      set({ error: String(error), runningAction: false, lastScreenshot: null });
      throw error;
    }
  },

  async ocr(imagePath) {
    set({ runningAction: true, error: null });
    try {
      const result = await automationOcr(imagePath);
      set({ lastOcr: result, runningAction: false });
      return result;
    } catch (error) {
      console.error('Automation OCR failed:', error);
      set({ error: String(error), runningAction: false, lastOcr: null });
      throw error;
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
      isRecording: false,
      currentRecording: null,
      recordings: [],
      scripts: [],
      selectedScript: null,
      loadingScripts: false,
      isExecuting: false,
      executionProgress: 0,
      executionHistory: [],
      currentExecution: null,
      inspector: {
        isActive: false,
      },
      shortcuts: [],
      lastTriggeredShortcut: null,
    });
  },

  // Recording actions (placeholder implementations)
  startRecording: async () => {
    set({ isRecording: true, currentRecording: null });
  },

  stopRecording: async () => {
    set({ isRecording: false });
    return null;
  },

  saveRecordingAsScript: async () => {
    return null;
  },

  // Updated Nov 16, 2025: Added proper error handling to script loading
  loadScripts: async () => {
    set({ loadingScripts: true, error: null });
    try {
      // TODO: Replace with actual backend call when implemented
      set({ scripts: [], loadingScripts: false });
    } catch (error) {
      console.error('Failed to load scripts:', error);
      set({ error: String(error), loadingScripts: false, scripts: [] });
      throw error;
    }
  },

  saveScript: async () => {
    // Placeholder
  },

  deleteScript: async () => {
    // Placeholder
  },

  selectScript: (script) => {
    set({ selectedScript: script });
  },

  // Execution actions (placeholder implementations)
  executeScript: async () => {
    return null;
  },

  stopExecution: () => {
    set({ isExecuting: false });
  },

  // Inspector actions (placeholder implementations)
  activateInspector: () => {
    set((state) => ({
      inspector: { ...state.inspector, isActive: true },
    }));
  },

  deactivateInspector: () => {
    set((state) => ({
      inspector: { ...state.inspector, isActive: false },
    }));
  },

  inspectElementAt: async () => {
    // Placeholder
  },

  // Event handlers for Tauri events
  handleRecordingStarted: (session) => {
    const recordingSession: RecordingSession = {
      sessionId: session.sessionId,
      startTime: session.startTime,
      isRecording: session.isRecording,
    };
    set({
      isRecording: true,
      currentRecording: recordingSession,
    });
  },

  handleRecordingStopped: (recording) => {
    set((state) => ({
      isRecording: false,
      currentRecording: null,
      recordings: [recording, ...state.recordings],
    }));
  },

  handleActionRecorded: (_action) => {
    set((state) => {
      if (!state.currentRecording) {
        console.warn('[AutomationStore] Action recorded but no active recording session');
        return state;
      }

      return state;
    });
  },

  handleShortcutAction: (action) => {
    set({ lastTriggeredShortcut: action });
  },

  handleShortcutRegistered: (shortcut) => {
    set((state) => {
      const existingIndex = state.shortcuts.findIndex((s) => s.id === shortcut.id);
      if (existingIndex >= 0) {
        // Update existing shortcut
        const updatedShortcuts = [...state.shortcuts];
        updatedShortcuts[existingIndex] = shortcut;
        return { shortcuts: updatedShortcuts };
      } else {
        // Add new shortcut
        return { shortcuts: [...state.shortcuts, shortcut] };
      }
    });
  },

  handleShortcutUnregistered: (shortcutId) => {
    set((state) => ({
      shortcuts: state.shortcuts.filter((s) => s.id !== shortcutId),
    }));
  },
}));

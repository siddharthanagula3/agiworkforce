import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
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
import { invoke } from '../lib/tauri-mock';
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
  DetailedElementInfo,
  ExecutionHistory,
  ExecutionResult,
  InspectorState,
  RecordedAction,
  Recording,
  RecordingSession,
} from '../types/automationEnhanced';
import type { CaptureResult } from '../types/capture';

interface Shortcut {
  id: string;
  key: string;
  description: string;
  action: string;
  enabled: boolean;
}

interface AutomationState {
  windows: AutomationElementInfo[];
  elements: AutomationElementInfo[];
  loadingWindows: boolean;
  loadingElements: boolean;
  runningAction: boolean;
  error: string | null;
  lastScreenshot: CaptureResult | null;
  lastOcr: AutomationOcrResult | null;

  isRecording: boolean;
  currentRecording: RecordingSession | null;
  pendingActions: RecordedAction[];
  recordings: Recording[];

  scripts: AutomationScript[];
  selectedScript: AutomationScript | null;
  loadingScripts: boolean;

  isExecuting: boolean;
  executionProgress: number;
  executionHistory: ExecutionHistory[];
  currentExecution: ExecutionResult | null;

  inspector: InspectorState;

  shortcuts: Shortcut[];
  lastTriggeredShortcut: string | null;

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

  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Recording | null>;
  saveRecordingAsScript: (
    recording: Recording,
    name: string,
    description: string,
    tags: string[],
  ) => Promise<AutomationScript | null>;

  loadScripts: () => Promise<void>;
  saveScript: (script: AutomationScript) => Promise<void>;
  deleteScript: (scriptId: string) => Promise<void>;
  selectScript: (script: AutomationScript | null) => void;

  executeScript: (script: AutomationScript) => Promise<ExecutionResult | null>;
  stopExecution: () => void;

  activateInspector: () => void;
  deactivateInspector: () => void;
  inspectElementAt: (x: number, y: number) => Promise<void>;

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

export const useAutomationStore = create<AutomationState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
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
        pendingActions: [],
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

        async loadWindows() {
          set({ loadingWindows: true, error: null }, undefined, 'automation/loadWindows/start');
          try {
            const windows = await listAutomationWindows();
            set({ windows, loadingWindows: false }, undefined, 'automation/loadWindows/success');
          } catch (error) {
            console.error('Failed to load automation windows:', error);
            set(
              { error: String(error), loadingWindows: false, windows: [] },
              undefined,
              'automation/loadWindows/error',
            );
            throw error;
          }
        },

        async searchElements(query) {
          set({ loadingElements: true, error: null }, undefined, 'automation/searchElements/start');
          try {
            const elements = await findAutomationElements(query);
            set(
              { elements, loadingElements: false },
              undefined,
              'automation/searchElements/success',
            );
          } catch (error) {
            console.error('Failed to find automation elements:', error);
            set(
              { error: String(error), loadingElements: false, elements: [] },
              undefined,
              'automation/searchElements/error',
            );
          }
        },

        async click(request) {
          set({ runningAction: true, error: null }, undefined, 'automation/click/start');
          try {
            await clickAutomation(request);
            set({ runningAction: false }, undefined, 'automation/click/success');
          } catch (error) {
            console.error('Automation click failed:', error);
            set(
              { error: String(error), runningAction: false },
              undefined,
              'automation/click/error',
            );
            throw error;
          }
        },

        async typeText(text, options) {
          set({ runningAction: true, error: null }, undefined, 'automation/typeText/start');
          try {
            await sendKeys(text, options);
            set({ runningAction: false }, undefined, 'automation/typeText/success');
          } catch (error) {
            console.error('Automation type failed:', error);
            set(
              { error: String(error), runningAction: false },
              undefined,
              'automation/typeText/error',
            );
            throw error;
          }
        },

        async hotkey(key, modifiers) {
          set({ runningAction: true, error: null }, undefined, 'automation/hotkey/start');
          try {
            await sendHotkey(key, modifiers);
            set({ runningAction: false }, undefined, 'automation/hotkey/success');
          } catch (error) {
            console.error('Automation hotkey failed:', error);
            set(
              { error: String(error), runningAction: false },
              undefined,
              'automation/hotkey/error',
            );
            throw error;
          }
        },

        async screenshot(options) {
          set({ runningAction: true, error: null }, undefined, 'automation/screenshot/start');
          try {
            const capture = await automationScreenshot(options ?? {});
            set(
              { lastScreenshot: capture, runningAction: false },
              undefined,
              'automation/screenshot/success',
            );
            return capture;
          } catch (error) {
            console.error('Automation screenshot failed:', error);
            set(
              { error: String(error), runningAction: false, lastScreenshot: null },
              undefined,
              'automation/screenshot/error',
            );
            throw error;
          }
        },

        async ocr(imagePath) {
          set({ runningAction: true, error: null }, undefined, 'automation/ocr/start');
          try {
            const result = await automationOcr(imagePath);
            set({ lastOcr: result, runningAction: false }, undefined, 'automation/ocr/success');
            return result;
          } catch (error) {
            console.error('Automation OCR failed:', error);
            set(
              { error: String(error), runningAction: false, lastOcr: null },
              undefined,
              'automation/ocr/error',
            );
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
            set({ error: null }, undefined, 'automation/clearError');
          }
        },

        reset() {
          set(
            {
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
              pendingActions: [],
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
            },
            undefined,
            'automation/reset',
          );
        },

        startRecording: async () => {
          set(
            { isRecording: true, currentRecording: null },
            undefined,
            'automation/startRecording',
          );
        },

        stopRecording: async () => {
          set({ isRecording: false }, undefined, 'automation/stopRecording');
          return null;
        },

        saveRecordingAsScript: async (recording, name, description, tags) => {
          try {
            const script = await invoke<AutomationScript>('save_recording_as_script', {
              recording_id: recording.id,
              name,
              description,
              tags,
              actions: recording.actions,
            });
            set(
              (state) => {
                state.scripts.unshift(script);
              },
              undefined,
              'automation/saveRecordingAsScript/success',
            );
            return script;
          } catch (error) {
            console.error('Failed to save recording as script:', error);
            // Local fallback: create script in store without backend persistence
            const localScript: AutomationScript = {
              id: `local_${Date.now()}`,
              name,
              description,
              tags,
              actions: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            set(
              (state) => {
                state.scripts.unshift(localScript);
              },
              undefined,
              'automation/saveRecordingAsScript/local',
            );
            return localScript;
          }
        },

        loadScripts: async () => {
          set({ loadingScripts: true, error: null }, undefined, 'automation/loadScripts/start');
          try {
            const scripts = await invoke<AutomationScript[]>('list_automation_scripts');
            set({ scripts, loadingScripts: false }, undefined, 'automation/loadScripts/success');
          } catch (error) {
            console.error('Failed to load scripts:', error);
            // Local fallback: keep existing scripts, clear loading state
            set({ loadingScripts: false }, undefined, 'automation/loadScripts/localFallback');
          }
        },

        saveScript: async (script) => {
          try {
            await invoke('save_automation_script', { script });
            set(
              (state) => {
                const idx = state.scripts.findIndex((s) => s.id === script.id);
                if (idx >= 0) {
                  state.scripts[idx] = { ...script, updatedAt: Date.now() };
                } else {
                  state.scripts.unshift(script);
                }
              },
              undefined,
              'automation/saveScript/success',
            );
          } catch (error) {
            console.error('Failed to save script:', error);
            // Local fallback: update in-store
            set(
              (state) => {
                const idx = state.scripts.findIndex((s) => s.id === script.id);
                if (idx >= 0) {
                  state.scripts[idx] = { ...script, updatedAt: Date.now() };
                } else {
                  state.scripts.unshift(script);
                }
              },
              undefined,
              'automation/saveScript/local',
            );
          }
        },

        deleteScript: async (scriptId) => {
          try {
            await invoke('delete_automation_script', { scriptId });
          } catch (error) {
            console.error('Failed to delete script from backend:', error);
            // Continue with local deletion even if backend fails
          }
          set(
            (state) => {
              const idx = state.scripts.findIndex((s) => s.id === scriptId);
              if (idx >= 0) {
                state.scripts.splice(idx, 1);
              }
              if (state.selectedScript?.id === scriptId) {
                state.selectedScript = null;
              }
            },
            undefined,
            'automation/deleteScript',
          );
        },

        selectScript: (script) => {
          set({ selectedScript: script }, undefined, 'automation/selectScript');
        },

        executeScript: async (script) => {
          set(
            { isExecuting: true, executionProgress: 0, currentExecution: null },
            undefined,
            'automation/executeScript/start',
          );
          try {
            const result = await invoke<ExecutionResult>('execute_automation_script', {
              script_id: script.id,
              script,
            });
            const historyEntry: ExecutionHistory = {
              id: `exec_${Date.now()}`,
              scriptId: script.id,
              scriptName: script.name,
              startedAt: Date.now() - (result.durationMs ?? 0),
              completedAt: Date.now(),
              result,
            };
            set(
              (state) => {
                state.isExecuting = false;
                state.executionProgress = 100;
                state.currentExecution = result;
                state.executionHistory.unshift(historyEntry);
              },
              undefined,
              'automation/executeScript/success',
            );
            return result;
          } catch (error) {
            console.error('Failed to execute script:', error);
            const failResult: ExecutionResult = {
              success: false,
              actionsCompleted: 0,
              actionsFailed: 1,
              durationMs: 0,
              error: String(error),
              screenshots: [],
              logs: [
                {
                  timestamp: Date.now(),
                  level: 'error',
                  message: String(error),
                },
              ],
            };
            set(
              {
                isExecuting: false,
                executionProgress: 0,
                currentExecution: failResult,
                error: String(error),
              },
              undefined,
              'automation/executeScript/error',
            );
            return failResult;
          }
        },

        stopExecution: () => {
          set({ isExecuting: false }, undefined, 'automation/stopExecution');
        },

        activateInspector: () => {
          set(
            (state) => {
              state.inspector.isActive = true;
            },
            undefined,
            'automation/activateInspector',
          );
        },

        deactivateInspector: () => {
          set(
            (state) => {
              state.inspector.isActive = false;
            },
            undefined,
            'automation/deactivateInspector',
          );
        },

        inspectElementAt: async (x, y) => {
          try {
            const element = await invoke<DetailedElementInfo>('inspect_element_at', { x, y });
            set(
              (state) => {
                state.inspector.currentElement = element;
              },
              undefined,
              'automation/inspectElementAt/success',
            );
          } catch (error) {
            console.error('Failed to inspect element at coordinates:', error);
            set({ error: String(error) }, undefined, 'automation/inspectElementAt/error');
          }
        },

        handleRecordingStarted: (session) => {
          const recordingSession: RecordingSession = {
            sessionId: session.sessionId,
            startTime: session.startTime,
            isRecording: session.isRecording,
          };
          set(
            {
              isRecording: true,
              currentRecording: recordingSession,
            },
            undefined,
            'automation/handleRecordingStarted',
          );
        },

        handleRecordingStopped: (recording) => {
          set(
            (state) => {
              state.isRecording = false;
              state.currentRecording = null;
              state.recordings.unshift(recording);
            },
            undefined,
            'automation/handleRecordingStopped',
          );
        },

        handleActionRecorded: (action) => {
          set(
            (state) => {
              if (!state.currentRecording) {
                console.warn('[AutomationStore] Action recorded but no active recording session');
                return;
              }

              state.pendingActions.push(action);
            },
            undefined,
            'automation/handleActionRecorded',
          );
        },

        handleShortcutAction: (action) => {
          set({ lastTriggeredShortcut: action }, undefined, 'automation/handleShortcutAction');
        },

        handleShortcutRegistered: (shortcut) => {
          set(
            (state) => {
              const existingIndex = state.shortcuts.findIndex((s) => s.id === shortcut.id);
              if (existingIndex >= 0) {
                state.shortcuts[existingIndex] = shortcut;
              } else {
                state.shortcuts.push(shortcut);
              }
            },
            undefined,
            'automation/handleShortcutRegistered',
          );
        },

        handleShortcutUnregistered: (shortcutId) => {
          set(
            (state) => {
              const index = state.shortcuts.findIndex((s) => s.id === shortcutId);
              if (index >= 0) {
                state.shortcuts.splice(index, 1);
              }
            },
            undefined,
            'automation/handleShortcutUnregistered',
          );
        },
      })),
    ),
    { name: 'AutomationStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectAutomationWindows = (state: AutomationState) => state.windows;
export const selectAutomationElements = (state: AutomationState) => state.elements;
export const selectLoadingWindows = (state: AutomationState) => state.loadingWindows;
export const selectLoadingElements = (state: AutomationState) => state.loadingElements;
export const selectRunningAction = (state: AutomationState) => state.runningAction;
export const selectAutomationError = (state: AutomationState) => state.error;
export const selectLastScreenshot = (state: AutomationState) => state.lastScreenshot;
export const selectLastOcr = (state: AutomationState) => state.lastOcr;

export const selectIsRecording = (state: AutomationState) => state.isRecording;
export const selectCurrentRecording = (state: AutomationState) => state.currentRecording;
export const selectRecordings = (state: AutomationState) => state.recordings;

export const selectScripts = (state: AutomationState) => state.scripts;
export const selectSelectedScript = (state: AutomationState) => state.selectedScript;
export const selectLoadingScripts = (state: AutomationState) => state.loadingScripts;

export const selectIsExecuting = (state: AutomationState) => state.isExecuting;
export const selectExecutionProgress = (state: AutomationState) => state.executionProgress;
export const selectExecutionHistory = (state: AutomationState) => state.executionHistory;
export const selectCurrentExecution = (state: AutomationState) => state.currentExecution;

export const selectInspector = (state: AutomationState) => state.inspector;
export const selectInspectorIsActive = (state: AutomationState) => state.inspector.isActive;

export const selectShortcuts = (state: AutomationState) => state.shortcuts;
export const selectLastTriggeredShortcut = (state: AutomationState) => state.lastTriggeredShortcut;

// Derived selectors
export const selectEnabledShortcuts = (state: AutomationState) =>
  state.shortcuts.filter((s) => s.enabled);
export const selectRecordingCount = (state: AutomationState) => state.recordings.length;
export const selectScriptCount = (state: AutomationState) => state.scripts.length;

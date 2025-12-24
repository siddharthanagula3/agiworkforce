import type { AutomationElementInfo } from './automation';

export interface RecordedAction {
  id: string;
  actionType: 'click' | 'type' | 'wait' | 'screenshot' | 'hotkey' | 'drag' | 'scroll';
  timestampMs: number;
  target?: AutomationElementInfo;
  value?: string;
  metadata?: Record<string, unknown>;
}

export interface Recording {
  id: string;
  name: string;
  description?: string;
  actions: RecordedAction[];
  durationMs: number;
  createdAt: number;
}

export interface RecordingSession {
  sessionId: string;
  startTime: number;
  isRecording: boolean;
}

export interface ElementProperties {
  [key: string]: string | number | boolean | null;
}

export interface DetailedElementInfo extends AutomationElementInfo {
  properties: ElementProperties;
  automationId?: string;
  parent?: AutomationElementInfo;
  children?: AutomationElementInfo[];
  isEnabled: boolean;
  isOffscreen: boolean;
  hasKeyboardFocus: boolean;
}

export interface ElementSelector {
  selectorType: 'automation_id' | 'name' | 'class_name' | 'xpath' | 'coordinates';
  value: string;
}

export interface InspectorState {
  isActive: boolean;
  currentElement?: DetailedElementInfo;
  hoveredElement?: DetailedElementInfo;
}

export interface ScriptAction {
  id: string;
  type: 'click' | 'type' | 'wait' | 'assert' | 'screenshot' | 'hotkey' | 'drag' | 'scroll' | 'loop';
  selector?: ElementSelector;
  coordinates?: { x: number; y: number };
  value?: string;
  duration?: number;
  condition?: string;
  repeatCount?: number;
}

export interface AutomationScript {
  id: string;
  name: string;
  description: string;
  tags: string[];
  actions: ScriptAction[];
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
}

export interface ExecutionResult {
  success: boolean;
  actionsCompleted: number;
  actionsFailed: number;
  durationMs: number;
  error?: string;
  screenshots: string[];
  logs: ExecutionLog[];
}

export interface ExecutionLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  actionId?: string;
}

export interface AutomationSchedule {
  id: string;
  scriptId: string;
  enabled: boolean;
  scheduleType: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
  nextRunAt?: number;
  lastRunAt?: number;
  cronExpression?: string;
  daysOfWeek?: number[];
  timeOfDay?: string;
}

export interface ExecutionHistory {
  id: string;
  scriptId: string;
  scriptName: string;
  startedAt: number;
  completedAt: number;
  result: ExecutionResult;
}

export interface AutomationError {
  id: string;
  scriptId?: string;
  actionId?: string;
  message: string;
  stack?: string;
  screenshot?: string;
  timestamp: number;
  context?: Record<string, unknown>;
  recoverable: boolean;
  suggestions: string[];
}

export interface AutomationLibrary {
  scripts: AutomationScript[];
  favorites: string[];
  recentlyUsed: string[];
  tags: string[];
}

export type CodeLanguage = 'python' | 'rust' | 'javascript' | 'typescript';

export interface GeneratedCode {
  language: CodeLanguage;
  code: string;
  dependencies: string[];
}

export interface OverlayConfig {
  showHighlights: boolean;
  showMouseTrail: boolean;
  showTypingIndicator: boolean;
  showWaitSpinner: boolean;
  highlightColor: string;
  highlightDuration: number;
}

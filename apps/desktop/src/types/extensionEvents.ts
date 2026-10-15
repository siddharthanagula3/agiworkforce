export interface ExtensionPageAction {
  id: string;
  type: string;
  selector?: string | null;
  value?: string | null;
  delay?: number | null;
}

export interface ExtensionPageContextEvent {
  task_id: string;
  url: string;
  title: string;
  tab_id: number;
  timestamp: number;
  selected_text?: string | null;
  actions?: ExtensionPageAction[];
}

export interface ExtensionTaskResultEvent {
  task_id: string;
  success: boolean;
  screenshot_path?: string | null;
  result?: unknown;
  error?: string | null;
  actions_performed?: number;
  duration?: number;
}

export interface ExtensionConnectionStatusEvent {
  connected: boolean;
  status?: string;
  extension_id?: string;
  reason?: string;
  timestamp?: number;
}

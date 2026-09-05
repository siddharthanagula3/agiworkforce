export type ComposerVoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'processing'
  | 'awaiting_action'
  | 'executing'
  | 'stopping'
  | 'error'
  | 'unsupported';

export interface ComposerVoiceController {
  state: ComposerVoiceState;
  onToggle: () => void | Promise<void>;
  idleLabel?: string;
}

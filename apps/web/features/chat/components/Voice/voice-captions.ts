import type { LiveTranscriptRole, LiveTranscriptTurn } from '@features/chat/lib/live-voice-session';

export const VOICE_CAPTION_LIMIT = 4;

export interface VoiceCaptionLine {
  readonly turnId: string;
  readonly role: LiveTranscriptRole;
  readonly text: string;
  readonly final: boolean;
}

/**
 * A partial turn arrives many times under one turnId, so a caption line is
 * replaced in place rather than appended, or the panel would repeat itself.
 */
export function appendVoiceCaption(
  lines: readonly VoiceCaptionLine[],
  turn: LiveTranscriptTurn,
): readonly VoiceCaptionLine[] {
  const text = turn.text.trim();
  if (!text) return lines;
  const next: VoiceCaptionLine = {
    turnId: turn.turnId,
    role: turn.role,
    text,
    final: turn.final,
  };
  const index = lines.findIndex((line) => line.turnId === turn.turnId);
  const merged =
    index === -1 ? [...lines, next] : lines.map((line, at) => (at === index ? next : line));
  return merged.slice(-VOICE_CAPTION_LIMIT);
}

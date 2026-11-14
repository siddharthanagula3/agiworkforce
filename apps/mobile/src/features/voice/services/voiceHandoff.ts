export type VoiceReply = string | null | undefined;

export interface VoiceHandoff {
  text: string;
  reply: Promise<VoiceReply>;
}

export interface VoiceHandoffSettler {
  resolve: (reply: VoiceReply) => void;
  reject: (error: unknown) => void;
}

let open: { conversationId: string; handoff: VoiceHandoff } | null = null;

export function openVoiceHandoff(conversationId: string, text: string): VoiceHandoffSettler {
  let resolve!: (reply: VoiceReply) => void;
  let reject!: (error: unknown) => void;
  const reply = new Promise<VoiceReply>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  reply.catch(() => undefined);
  open = { conversationId, handoff: { text, reply } };
  return { resolve, reject };
}

export function takeVoiceHandoff(conversationId: string): VoiceHandoff | null {
  if (open?.conversationId !== conversationId) return null;
  const { handoff } = open;
  open = null;
  return handoff;
}

export function discardVoiceHandoff(conversationId: string): void {
  if (open?.conversationId === conversationId) open = null;
}

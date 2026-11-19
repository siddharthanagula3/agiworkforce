export type ClientMessageRole<R extends string> = Exclude<R, 'system'> | 'assistant';

// A stored 'system' row was written by a client or a share import, never by the
// server, so every client must receive it as an assistant turn it cannot replay
// with system authority.
export function clientMessageRole<R extends string>(role: R): ClientMessageRole<R> {
  return role === 'system' ? 'assistant' : (role as Exclude<R, 'system'>);
}

export function withClientMessageRole<T extends { role: string }>(message: T): T {
  return message.role === 'system' ? ({ ...message, role: 'assistant' } as T) : message;
}

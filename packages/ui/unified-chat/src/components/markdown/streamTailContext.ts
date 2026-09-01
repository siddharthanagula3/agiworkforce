import { createContext, useContext } from 'react';

const NOT_A_STREAM_TAIL = false;

export const StreamTailContext = createContext(NOT_A_STREAM_TAIL);

export function useIsStreamTail(): boolean {
  return useContext(StreamTailContext);
}

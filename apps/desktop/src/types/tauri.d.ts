type TauriCommandResult = any;

type TauriInvoke = (command: string, args?: Record<string, any>) => Promise<TauriCommandResult>;

type TauriEventListener = (payload: any) => void;

type TauriUnlisten = () => void;

type TauriEventListen = (event: string, handler: TauriEventListener) => Promise<TauriUnlisten>;

type TauriEventEmit = (event: string, payload?: any) => Promise<void>;

interface TauriEventAPI {
  listen: TauriEventListen;
  emit: TauriEventEmit;
}

interface TauriAPI {
  invoke: TauriInvoke;
  event: TauriEventAPI;
}

declare global {
  interface Window {
    __TAURI__?: TauriAPI;
  }
}

export {};

import { emit, listen, once } from '../tauri-mock';

export type UnlistenFn = () => void | Promise<void>;

export { emit, listen, once };

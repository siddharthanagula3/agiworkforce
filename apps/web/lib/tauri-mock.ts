// Mock implementation of Tauri invoke for the web app
// The web app uses standard fetch calls instead of Tauri IPC.
// This mock prevents compiler errors for ported desktop components.

export async function invoke<T>(cmd: string, args?: any): Promise<T> {
    console.warn(`[Tauri Mock] Called invoke('${cmd}') in web environment. This should be replaced with a fetch() call to the web backend.`);
    return {} as T;
}

export const isTauri = false;

declare module 'qrcode/lib/browser' {
  export interface QrModules {
    size: number;
    get(row: number, col: number): number;
  }
  export function create(text: string): { modules: QrModules };
}

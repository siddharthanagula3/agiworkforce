import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import mermaidRuntimeAsset from '@/assets/vendor/mermaid.min.mermaidjs';

let runtime: Promise<string> | null = null;

export function inlineScriptSource(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script');
}

async function readBundledRuntime(): Promise<string> {
  const asset = await Asset.fromModule(mermaidRuntimeAsset).downloadAsync();
  if (!asset.localUri) throw new Error('The diagram renderer is not available on this device.');
  return inlineScriptSource(await readAsStringAsync(asset.localUri));
}

export function loadMermaidRuntime(): Promise<string> {
  if (!runtime) {
    runtime = readBundledRuntime().catch((error: unknown) => {
      runtime = null;
      throw error;
    });
  }
  return runtime;
}

const fs = require('fs');

const agentStorePath = 'apps/web/stores/unified/chat/agentStore.ts';
if (fs.existsSync(agentStorePath)) {
  let content = fs.readFileSync(agentStorePath, 'utf8');
  content = content.replace(/process\.env\['TAURI_ENV_DEBUG'\](?! ===)/g, "process.env['TAURI_ENV_DEBUG'] === 'true'");
  fs.writeFileSync(agentStorePath, content, 'utf8');
}

const chatStorePath = 'apps/web/stores/unified/chat/chatStore.ts';
if (fs.existsSync(chatStorePath)) {
  let content = fs.readFileSync(chatStorePath, 'utf8');
  content = content.replace(/process\.env\['TAURI_ENV_DEBUG'\](?! ===)/g, "process.env['TAURI_ENV_DEBUG'] === 'true'");
  fs.writeFileSync(chatStorePath, content, 'utf8');
}

const toolStorePath = 'apps/web/stores/unified/chat/toolStore.ts';
if (fs.existsSync(toolStorePath)) {
  let content = fs.readFileSync(toolStorePath, 'utf8');
  content = content.replace(/process\.env\['TAURI_ENV_DEBUG'\](?! ===)/g, "process.env['TAURI_ENV_DEBUG'] === 'true'");
  fs.writeFileSync(toolStorePath, content, 'utf8');
}

const uiStorePath = 'apps/web/stores/unified/ui.ts';
if (fs.existsSync(uiStorePath)) {
  let content = fs.readFileSync(uiStorePath, 'utf8');
  content = content.replace(/process\.env\['TAURI_ENV_DEBUG'\](?! ===)/g, "process.env['TAURI_ENV_DEBUG'] === 'true'");
  content = content.replace(/import \{ useModelStore \} from '\.\/modelStore';/g, '');
  content = content.replace(/import \{ useAccountStore \} from '\.\/accountStore';/g, '');
  content = content.replace(/useModelStore\.getState\(\)/g, "({} as any)");
  content = content.replace(/useAccountStore\.getState\(\)/g, "({} as any)");
  fs.writeFileSync(uiStorePath, content, 'utf8');
}

const typesChatPath = 'apps/web/types/chat.ts';
if (fs.existsSync(typesChatPath)) {
  let content = fs.readFileSync(typesChatPath, 'utf8');
  if (!content.includes('Artifact')) {
    content += '\nexport type Artifact = any;\n';
    fs.writeFileSync(typesChatPath, content, 'utf8');
  }
}

const localStoragePath = 'apps/web/utils/localStorage.ts';
if (fs.existsSync(localStoragePath)) {
  let content = fs.readFileSync(localStoragePath, 'utf8');
  if (!content.includes('safeGetJSON')) {
    content += `
export function safeGetJSON<T>(key: string, defaultValue: T): T { return getItem(key, defaultValue); }
export function safeSetJSON<T>(key: string, value: T): void { setItem(key, value); }
export const storageFallback = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
`;
    fs.writeFileSync(localStoragePath, content, 'utf8');
  }
}

const fs = require('fs');
const path = require('path');

const MISSING_MODULES = [
  '../api/accountApi',
  '@/constants/llm',
  '@/constants/planModels',
  '@/providers/ThemeProvider',
  '@/services/supabaseAuth'
];

const STUB_CONTENT = `
export const _stub = true;
export default {} as any;
// specific exports for tests
export const LLM_MODELS = [];
export const PLAN_MODELS = [];
export const ThemeProvider = ({children}: any) => children;
export const useTheme = () => ({ theme: 'dark', setTheme: () => {} });
export const supabase = {} as any;
`;

const TARGET_DIR = path.resolve(__dirname, '..');

for (const mod of MISSING_MODULES) {
  let relativePath = mod;
  if (mod.startsWith('@/')) {
    relativePath = mod.substring(2);
  } else if (mod.startsWith('../')) {
    relativePath = mod.substring(3); // remove ../
  }
  
  const ext = relativePath.startsWith('components/') || relativePath.startsWith('providers/') ? '.tsx' : '.ts';
  const filePath = path.join(TARGET_DIR, relativePath + ext);
  
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, STUB_CONTENT, 'utf8');
    console.log('Stubbed', filePath);
  }
}

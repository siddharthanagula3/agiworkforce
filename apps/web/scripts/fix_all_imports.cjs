const fs = require('fs');
const path = require('path');

const DIRS = [
  '../components/UnifiedAgenticChat',
  '../components/ToolCalling',
  '../components/Artifacts',
  '../components/AGI',
  '../components/BackgroundTasks',
  '../components/CustomInstructions',
  '../components/Errors',
  '../components/Feedback',
  '../components/Layout',
  '../components/Memory',
  '../components/SimpleMode',
  '../hooks',
  '../lib',
  '../utils',
  '../types',
  '../constants',
  '../handlers',
  '../stores/unified',
].map((d) => path.resolve(__dirname, d));

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');

      // Fast path absolute rewriting for stores
      content = content.replace(
        /['"]\.\.\/\.\.\/\.\.\/stores(?:([^'"]*))['"]/g,
        "'@/stores/unified$1'",
      );
      content = content.replace(/['"]\.\.\/\.\.\/stores(?:([^'"]*))['"]/g, "'@/stores/unified$1'");
      content = content.replace(/['"]\.\.\/stores(?:([^'"]*))['"]/g, "'@/stores/unified$1'");

      // Fast path absolute rewriting for common dirs
      const rootDirs = [
        'utils',
        'hooks',
        'lib',
        'types',
        'constants',
        'handlers',
        'services',
        'providers',
        'components',
      ];
      for (const d of rootDirs) {
        const regex3 = new RegExp(`['"]\\.\\.\\/\\.\\.\\/\\.\\.\\/${d}(?:([^'"]*))['"]`, 'g');
        const regex2 = new RegExp(`['"]\\.\\.\\/\\.\\.\\/${d}(?:([^'"]*))['"]`, 'g');
        content = content.replace(regex3, `'@/${d}$1'`);
        content = content.replace(regex2, `'@/${d}$1'`);
        const regex1 = new RegExp(`['"]\\.\\.\\/${d}(?:([^'"]*))['"]`, 'g');
        content = content.replace(regex1, `'@/${d}$1'`);
      }

      // Tauri mocks specifically
      content = content.replace(/['"]@\/lib\/tauri-mock['"]/g, "'@/lib/tauri-mock'");

      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

for (const dir of DIRS) {
  processDir(dir);
}
console.log('Finished rewriting imports globally.');

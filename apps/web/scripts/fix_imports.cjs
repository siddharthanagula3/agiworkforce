const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.resolve(__dirname, '../components/UnifiedAgenticChat');
const STORE_DIR = path.resolve(__dirname, '../stores/unified');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');

            // Rewrite general store imports
            content = content.replace(/['"]\.\.\/\.\.\/\.\.\/stores(?:([^'"]*))['"]/g, "'@/stores/unified$1'");
            content = content.replace(/['"]\.\.\/\.\.\/stores(?:([^'"]*))['"]/g, "'@/stores/unified$1'");
            content = content.replace(/['"]\.\.\/stores(?:([^'"]*))['"]/g, "'@/stores/unified$1'");

            // Rewrite utils and hooks imports
            content = content.replace(/['"]\.\.\/\.\.\/\.\.\/utils(?:([^'"]*))['"]/g, "'@/utils$1'");
            content = content.replace(/['"]\.\.\/\.\.\/utils(?:([^'"]*))['"]/g, "'@/utils$1'");
            content = content.replace(/['"]\.\.\/utils(?:([^'"]*))['"]/g, "'@/utils$1'");

            content = content.replace(/['"]\.\.\/\.\.\/\.\.\/hooks(?:([^'"]*))['"]/g, "'@/hooks$1'");
            content = content.replace(/['"]\.\.\/\.\.\/hooks(?:([^'"]*))['"]/g, "'@/hooks$1'");
            content = content.replace(/['"]\.\.\/hooks(?:([^'"]*))['"]/g, "'@/hooks$1'");

            // Rewrite common types and lib
            content = content.replace(/['"]\.\.\/\.\.\/\.\.\/(lib|types|constants|handlers|services|providers)(?:([^'"]*))['"]/g, "'@/$1$2'");
            content = content.replace(/['"]\.\.\/\.\.\/(lib|types|constants|handlers|services|providers)(?:([^'"]*))['"]/g, "'@/$1$2'");

            // Tauri mocks
            content = content.replace(/['"]@\/lib\/tauri-mock['"]/g, "'@/lib/tauri-mock'");

            fs.writeFileSync(fullPath, content, 'utf8');
        }
    }
}

// Also process the unified stores folder
function processStores(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processStores(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');

            content = content.replace(/['"]\.\.\/\.\.\/\.\.\/(lib|types|utils)(?:([^'"]*))['"]/g, "'@/$1$2'");
            content = content.replace(/['"]\.\.\/\.\.\/(lib|types|utils)(?:([^'"]*))['"]/g, "'@/$1$2'");
            content = content.replace(/['"]\.\.\/(lib|types|utils)(?:([^'"]*))['"]/g, "'@/$1$2'");

            fs.writeFileSync(fullPath, content, 'utf8');
        }
    }
}

processDir(TARGET_DIR);
processStores(STORE_DIR);
console.log('Finished rewriting imports in components and stores.');

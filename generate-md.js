const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const outputFile = path.join(projectRoot, 'project_source_code.md');

// directories/files to ignore
const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.gemini', 'package-lock.json'];
const ignoreExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.mp4', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'];

let mdContent = '# Project Source Code\n\n';

function traverseDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (ignoreDirs.includes(file)) continue;

        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            traverseDir(fullPath);
        } else {
            const ext = path.extname(file).toLowerCase();
            if (ignoreExts.includes(ext) || file === 'project_source_code.md' || file === 'generate-md.js' || file.includes('package-lock')) continue;

            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const relPath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
                let mdLang = ext.substring(1);
                if (mdLang === 'jsx' || mdLang === 'js') mdLang = 'javascript';
                if (mdLang === 'css') mdLang = 'css';
                if (mdLang === 'json') mdLang = 'json';
                
                mdContent += `## ${relPath}\n\n\`\`\`${mdLang}\n${content}\n\`\`\`\n\n`;
            } catch (err) {
                console.error(`Could not read file: ${fullPath}`);
            }
        }
    }
}

try {
    traverseDir(projectRoot);
    fs.writeFileSync(outputFile, mdContent);
    console.log('Successfully generated: ' + outputFile);
} catch (error) {
    console.error('Error generating markdown:', error);
}

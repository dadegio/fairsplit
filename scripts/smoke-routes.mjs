import fs from 'node:fs';
const required = ['api/index.ts', 'server/src/app.ts', 'server/src/routes.ts', 'web/src/api.ts'];
for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}
const apiFiles = fs.readdirSync('api').filter(f => f.endsWith('.ts'));
if (apiFiles.length !== 1 || apiFiles[0] !== 'index.ts') {
  console.error(`Expected exactly one Vercel Function api/index.ts, found: ${apiFiles.join(', ')}`);
  process.exit(1);
}
const vercel = fs.readFileSync('vercel.json','utf8');
if (!vercel.includes('/api?path=$1')) {
  console.error('Missing /api rewrite to single function');
  process.exit(1);
}
console.log('Single API function routing OK');

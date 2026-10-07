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
const apiEntry = fs.readFileSync('api/index.ts', 'utf8');
if (!apiEntry.includes("import('../server/dist/src/app.js')")) {
  console.error('Vercel API entrypoint must dynamically import the ESM server app');
  process.exit(1);
}
if (/^import\s+app\s+from\s+['"]\.\.\/server\/dist\/src\/app\.js['"];?$/m.test(apiEntry)) {
  console.error('Static server app import would be compiled to require() and fail with ERR_REQUIRE_ESM');
  process.exit(1);
}
const vercel = fs.readFileSync('vercel.json','utf8');
if (!vercel.includes('/api?path=$1')) {
  console.error('Missing /api rewrite to single function');
  process.exit(1);
}
console.log('Single API function routing OK');

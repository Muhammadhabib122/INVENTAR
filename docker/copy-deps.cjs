// Berilgan paket va uning barcha bog'liqliklarini boshqa papkaga ko'chiradi.
// Docker'da Prisma CLI'ni internetsiz (build bosqichidan) olish uchun ishlatiladi.
// Ishlatish: node docker/copy-deps.cjs prisma /opt/prisma-cli/node_modules
const fs = require('fs');
const path = require('path');
const [, , root, dest] = process.argv;
const src = path.resolve('node_modules');
const seen = new Set();
function walk(name) {
  if (seen.has(name)) return;
  const dir = path.join(src, name);
  if (!fs.existsSync(dir)) return;
  seen.add(name);
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  for (const d of Object.keys({ ...pj.dependencies, ...pj.optionalDependencies })) walk(d);
}
walk(root);
for (const n of seen) fs.cpSync(path.join(src, n), path.join(dest, n), { recursive: true, dereference: true });
console.log(`${seen.size} ta paket ko'chirildi: ${dest}`);

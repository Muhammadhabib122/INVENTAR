// Lotin matnlarni kirillga o'giradi va src/lib/i18n.ts dagi @cyr-begin..@cyr-end oralig'iga yozadi.
// Mavjud (qo'lda tuzatilgan) kirill matnlar saqlanadi, faqat yetishmayotganlari qo'shiladi.
import fs from 'node:fs';
import path from 'node:path';
import { lat, cyr } from '../src/lib/i18n';
import { toCyr } from '../src/lib/translit';

const file = path.join(__dirname, '../src/lib/i18n.ts');
const src = fs.readFileSync(file, 'utf8');
const out: Record<string, string> = {};
for (const k of Object.keys(lat) as (keyof typeof lat)[]) out[k] = (cyr as Record<string, string>)[k] ?? toCyr(lat[k]);
const body =
  '// @cyr-begin\nexport const cyr: Partial<Record<MsgKey, string>> = {\n' +
  Object.entries(out).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n') +
  '\n};\n// @cyr-end';
fs.writeFileSync(file, src.replace(/\/\/ @cyr-begin[\s\S]*?\/\/ @cyr-end/, body));
console.log('kirill matnlar:', Object.keys(out).length);

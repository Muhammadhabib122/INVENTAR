// O'zbek lotin → kirill o'giruvchi (interfeys matnlari uchun).
const KEEP = new Set(['Excel', 'CSV', 'QR', 'PDF', 'A4', 'HTTPS', 'PWA', 'Safari', 'Chrome', 'Android', 'iPhone', 'ID', 'xlsx', 'OK', 'IndexedDB', 'BOM', 'Firefox']);
const AP = "'’ʻʼ‘`";
const single: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з', c: 'с', w: 'в',
};
const isAp = (c: string | undefined) => !!c && AP.includes(c);
const up = (s: string, upper: boolean) => (upper ? s.toUpperCase() : s);

function word(w: string): string {
  if (KEEP.has(w) || /^[A-Za-z]*\d/.test(w)) return w;
  const allUp = w.length > 1 && w === w.toUpperCase();
  let r = '';
  const low = w.toLowerCase();
  for (let i = 0; i < w.length; i++) {
    const c = low[i], n = low[i + 1], U = w[i] !== low[i];
    const U2 = allUp || U;
    if (c === 'o' && isAp(n)) { r += up('ў', U); i++; continue; }
    if (c === 'g' && isAp(n)) { r += up('ғ', U); i++; continue; }
    if (c === 's' && n === 'h') { r += up('ш', U); i++; continue; }
    if (c === 'c' && n === 'h') { r += up('ч', U); i++; continue; }
    if (c === 'y' && n && 'oaue'.includes(n) && !(n === 'o' && isAp(low[i + 2]))) {
      r += up({ o: 'ё', a: 'я', u: 'ю', e: 'е' }[n]!, U); i++; continue;
    }
    if (c === 't' && low.startsWith('tsi', i) && (low.startsWith('tsiya', i) || low.startsWith('tsion', i))) { r += up('ц', U); i++; continue; }
    if (c === 'e' && i === 0) { r += up('э', U); continue; }
    if (isAp(c)) { if (i > 0) r += up('ъ', allUp); continue; }
    if (single[c]) { r += up(single[c], U2 && U); continue; }
    r += w[i];
  }
  return allUp ? r.toUpperCase() : r;
}

export function toCyr(s: string): string {
  // {o'zgaruvchi} va URL'larni o'zgartirmaymiz
  return s.split(/(\{[^}]*\}|https?:\/\/\S+|\.[a-z]{3,4}\b)/).map((part, idx) =>
    idx % 2 ? part : part.replace(/[A-Za-z'’ʻʼ‘`]+/g, (m) => {
      // so'z boshidagi/oxiridagi tirnoqlar tutuq belgisi emas
      const lead = m.match(/^['’ʻʼ‘`]+/)?.[0] ?? '';
      const rest = m.slice(lead.length);
      const trail = rest.match(/(?<![oOgG])['’ʻʼ‘`]+$/)?.[0] ?? '';
      const core = trail ? rest.slice(0, -trail.length) : rest;
      return lead + word(core) + trail;
    }),
  ).join('');
}

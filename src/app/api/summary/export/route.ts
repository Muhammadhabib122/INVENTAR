// Yig'ma eksport: barcha (yoki bitta bino) bo'limlarining buyumlari, bo'lim nomi alohida ustunda.
import * as XLSX from '@e965/xlsx';
import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { summary } from '@/server/summary';
import { sectionState } from '@/server/state';
import { buildReport, COLS, rowArr } from '@/lib/report';
import { translate } from '@/lib/i18n';
import type { State, Item } from '@/lib/sectionData';

export const maxDuration = 120;

export const GET = api(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const buildingId = sp.get('buildingId') || undefined;
  const t = (k: Parameters<typeof translate>[1]) => translate(u.lang, k);
  const rows = await summary(prisma, u, buildingId);
  const sumSheet: (string | number)[][] = [
    [t('building'), t('section_name'), t('file'), t('total'), t('col_sum'), t('f_found'), t('col_sum'), t('f_missing'), t('col_sum'), t('done_pct'), t('k_extra'), t('k_other_section'), t('f_elsewhere'), t('k_dup'), t('k_noinv'), t('rooms_title'), t('status')],
    ...rows.map((r) => [r.buildingName, r.name, r.originalFileName, r.total, r.totalSum, r.found, r.foundSum, r.missing, r.missingSum, r.total ? Math.round((r.found / r.total) * 1000) / 10 : 0, r.extrasNotInDb, r.otherSection, r.elsewhere, r.dups, r.noInvQty, `${r.roomsDone}/${r.rooms}`, r.status === 'DONE' ? t('section_done_tag') : t('in_progress')]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumSheet), t('nav_summary').slice(0, 31));
  if (sp.get('detail') === '1') {
    const detail: (string | number)[][] = [[t('building'), t('section_name'), ...COLS.map((c) => t(c))]];
    for (const r of rows) {
      const st = (await sectionState(prisma, u, r.id)) as unknown as State;
      const items = (await prisma.item.findMany({ where: { sectionId: r.id }, orderBy: { ord: 'asc' } })).map((x) => ({ inv: x.inv, name: x.name, unit: x.unit, mol: x.mol, dept: x.dept, sum: x.sum, delisted: !!x.delistedAt })) as Item[];
      const rep = buildReport(items, JSON.parse(JSON.stringify(st)), r.buildingName, u.lang);
      rep.rows.forEach((x) => detail.push([r.buildingName, r.name, ...rowArr(x)]));
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), t('detail_sheet').slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const name = (buildingId ? rows[0]?.buildingName || 'bino' : 'FarDTU') + ' - ' + t('nav_summary') + '.xlsx';
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
});

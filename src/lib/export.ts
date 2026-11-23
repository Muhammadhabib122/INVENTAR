'use client';
import { download } from './client';
import { toCsv } from './report';

export async function downloadXlsx(fileName: string, sheets: { name: string; rows: (string | number)[][]; widths?: number[] }[]) {
  const XLSX = await import('@e965/xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.widths) ws['!cols'] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  download(fileName, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export function downloadCsv(fileName: string, header: string[], rows: (string | number)[][]) {
  download(fileName, new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }));
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 100) || 'hisobot';

'use client';
import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useApp } from '@/components/AppContext';
import { useCurrent } from '@/lib/current';
import { useSectionData, type Item } from '@/lib/sectionData';

/** QR ichida faqat inventar raqam — eski yorliqlar bilan bir xil */
function qrSvg(inv: string) {
  const q = qrcode(0, 'M');
  q.addData(inv);
  q.make();
  return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}

function Sheet({ items, per }: { items: Item[]; per: number }) {
  return (
    <div className={'sheet s' + per}>
      {items.map((x) => (
        <div className="lb" key={x.inv}>
          <div dangerouslySetInnerHTML={{ __html: qrSvg(x.inv) }} />
          <div>
            <b>{x.inv}</b>
          </div>
          <div className="nm">{x.name.slice(0, 40)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Labels() {
  const { t, toast } = useApp();
  const { sectionId, section } = useCurrent();
  const { items } = useSectionData(sectionId, { poll: false });
  const [per, setPer] = useState(48);
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => (items || []).filter((x) => !x.delisted && (!q || x.inv.includes(q) || x.name.toLowerCase().includes(q.toLowerCase()))), [items, q]);
  const pages = Math.max(1, Math.ceil(list.length / per));
  const pg = Math.min(page, pages - 1);

  useEffect(() => {
    if (!all) return;
    const tm = setTimeout(() => {
      try {
        window.print();
      } catch {
        toast(t('print_failed'));
      }
      setAll(false);
    }, 300);
    return () => clearTimeout(tm);
  }, [all, t, toast]);

  if (!sectionId) return <main />;
  return (
    <main>
      <div className="np">
        <div className="card">
          <b>{section?.name}</b>
          <br />
          <small className="mut">{t('labels_info', { n: list.length, p: pages, per })}</small>
        </div>
        <select value={per} onChange={(e) => (setPer(Number(e.target.value)), setPage(0))}>
          <option value={48}>{t('labels_48')}</option>
          <option value={24}>{t('labels_24')}</option>
          <option value={12}>{t('labels_12')}</option>
        </select>
        <input type="search" placeholder={t('list_search')} value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} style={{ marginTop: 8 }} />
        <div className="row">
          <button className="btn s" disabled={pg === 0} onClick={() => setPage(pg - 1)}>
            {t('prev')}
          </button>
          <span className="auto" style={{ alignSelf: 'center', minWidth: 70, textAlign: 'center' }}>
            {t('page_of', { a: pg + 1, b: pages })}
          </span>
          <button className="btn s" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>
            {t('next')}
          </button>
        </div>
        <div className="row">
          <button className="btn" disabled={!list.length} onClick={() => window.print()}>
            {t('print_this')}
          </button>
          <button className="btn s" disabled={!list.length} onClick={() => setAll(true)}>
            {t('print_all')}
          </button>
        </div>
        <p className="h">{t('labels_h')}</p>
      </div>
      {!items && <div className="card mut">{t('loading')}</div>}
      {all
        ? Array.from({ length: pages }, (_, i) => <Sheet key={i} items={list.slice(i * per, (i + 1) * per)} per={per} />)
        : list.length > 0 && <Sheet items={list.slice(pg * per, (pg + 1) * per)} per={per} />}
    </main>
  );
}

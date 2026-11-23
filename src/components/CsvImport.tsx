'use client';
// Eski ilovalardan CSV ko'chirish (9-bosqichda to'liq yoziladi)
import { useApp } from './AppContext';
export function CsvImport({ onDone }: { section: { id: string; name: string }; onDone: () => void }) {
  const { t } = useApp();
  return (
    <div className="card">
      <button className="btn s" onClick={onDone}>
        {t('back')}
      </button>
    </div>
  );
}

'use client';
// Kichik IndexedDB o'rami: "ops" — yuborilmagan amallar navbati, "kv" — kesh, "failed" — server qabul qilmagan amallar.
export type Store = 'ops' | 'kv' | 'failed';

const dbs = new Map<string, Promise<IDBDatabase>>();
function open(name: string) {
  let p = dbs.get(name);
  if (!p) {
    p = new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('ops')) db.createObjectStore('ops', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('failed')) db.createObjectStore('failed', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    dbs.set(name, p);
  }
  return p;
}

function req<T>(r: IDBRequest<T>) {
  return new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function idb(name: string) {
  const st = async (s: Store, mode: IDBTransactionMode) => (await open(name)).transaction(s, mode).objectStore(s);
  return {
    async put(s: Store, v: unknown, key?: IDBValidKey) {
      const o = await st(s, 'readwrite');
      await req(key === undefined ? o.put(v) : o.put(v, key));
      // tranzaksiya tugashini kutamiz — yozuv diskka tushdi
      await new Promise<void>((res, rej) => {
        o.transaction.oncomplete = () => res();
        o.transaction.onerror = () => rej(o.transaction.error);
        o.transaction.onabort = () => rej(o.transaction.error);
      });
    },
    async get<T>(s: Store, key: IDBValidKey): Promise<T | undefined> {
      return req((await st(s, 'readonly')).get(key));
    },
    async all<T>(s: Store): Promise<T[]> {
      return req((await st(s, 'readonly')).getAll()) as Promise<T[]>;
    },
    async del(s: Store, key: IDBValidKey) {
      await req((await st(s, 'readwrite')).delete(key));
    },
    async count(s: Store) {
      return req((await st(s, 'readonly')).count());
    },
  };
}

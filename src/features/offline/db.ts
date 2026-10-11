/**
 * The device's copy of the account's data, in IndexedDB – what the app
 * shows, online or not. Five stores: the three synced kinds (by id), the
 * outbox of changes not yet sent (by sequence) and a few settings (`meta`).
 * Cleared on logout.
 */

const NAME = "boop";
const VERSION = 1;

export type StoreName =
  | "calendars"
  | "stamps"
  | "placements"
  | "outbox"
  | "meta";

const STORES: StoreName[] = [
  "calendars",
  "stamps",
  "placements",
  "outbox",
  "meta",
];

let opening: Promise<IDBDatabase> | null = null;

const open = () => {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["calendars", "stamps", "placements"]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "seq" });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
};

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export const getAll = async <T>(store: StoreName): Promise<T[]> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
};

export const getMeta = async <T>(key: string): Promise<T | undefined> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction("meta").objectStore("meta").get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
};

/** One write – put a value (by its key path, or `key` for meta) or delete. */
export type Op =
  | { store: StoreName; put: unknown; key?: string }
  | { store: StoreName; delete: IDBValidKey };

/** Several writes in one transaction – all or none. */
export const write = async (ops: Op[]) => {
  if (!ops.length) return;
  const db = await open();
  const names = [...new Set(ops.map((op) => op.store))];
  const tx = db.transaction(names, "readwrite");
  for (const op of ops) {
    const store = tx.objectStore(op.store);
    if ("put" in op) {
      if (op.key === undefined) store.put(op.put);
      else store.put(op.put, op.key);
    } else store.delete(op.delete);
  }
  await done(tx);
};

/** Everything on this device – at logout, or when another account logs in. */
export const clearAll = async () => {
  const db = await open();
  const tx = db.transaction(STORES, "readwrite");
  for (const name of STORES) tx.objectStore(name).clear();
  await done(tx);
};

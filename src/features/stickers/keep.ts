/**
 * The stamps' pictures kept on the device (render.ts): in IndexedDB, as the
 * PNGs they were rendered to, by the stamp's fingerprint (`stickerKey`, the
 * pictures' version in it). A page opened again shows the stamps it has
 * seen right away – no WebGL, nothing to render. Their bytes, not a Blob:
 * Safari keeps no Blob in a private window.
 *
 * Two stores: the pictures, and when each was last shown. Once there are
 * more than MOST, those not shown the longest go – and those of another
 * version anyway – a while after new ones came. All of it goes with the
 * rest of the device's copy (offline/db.ts `clearAll`): at logout, with the
 * account, when another one logs in.
 *
 * Nothing here is needed: should IndexedDB fail or be missing, a picture is
 * simply rendered again.
 */

const NAME = "boop-pictures";
const VERSION = 1;
const PICTURES = "pictures";
const USED = "used";
const PNG = "image/png";

/** The most pictures kept – each some 30–50 kB. */
export const MOST = 300;
/** A picture shown again is marked so at most this often (ms). */
const TOUCH = 24 * 60 * 60 * 1000;
/** After new pictures came, the old ones go this much later (ms). */
const TIDY = 5000;

let opening: Promise<IDBDatabase | null> | null = null;
/** Counts the times all was forgotten – a picture from before isn't kept. */
let era = 0;

const open = () => {
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [PICTURES, USED]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer app wants to change the stores: this one lets go.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
};

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

// Asked for in the same moment: read in one go.
const asked = new Map<string, ((blob: Blob | null) => void)[]>();
let reading = false;

const readAll = async () => {
  const keys = [...asked.keys()];
  const waiting = new Map(asked);
  asked.clear();
  reading = false;
  const found = new Map<string, Blob>();
  const stale: string[] = [];
  try {
    const db = await open();
    if (db) {
      const tx = db.transaction([PICTURES, USED]);
      const pictures = tx.objectStore(PICTURES);
      const used = tx.objectStore(USED);
      const now = Date.now();
      for (const key of keys) {
        const picture = pictures.get(key);
        picture.onsuccess = () => {
          if (picture.result instanceof ArrayBuffer) {
            found.set(key, new Blob([picture.result], { type: PNG }));
          }
        };
        const when = used.get(key);
        when.onsuccess = () => {
          if (typeof when.result !== "number" || now - when.result > TOUCH) {
            stale.push(key);
          }
        };
      }
      await done(tx);
      // Shown again: marked, so it isn't the next to go.
      const touched = stale.filter((key) => found.has(key));
      if (touched.length) {
        const write = db.transaction(USED, "readwrite");
        for (const key of touched) write.objectStore(USED).put(now, key);
        void done(write).catch(() => undefined);
      }
    }
  } catch {
    // Read nothing – rendered again.
  }
  for (const [key, callers] of waiting) {
    for (const call of callers) call(found.get(key) ?? null);
  }
};

/** The picture kept for this key – null when there is none (or no store). */
export const readPicture = (key: string) =>
  new Promise<Blob | null>((resolve) => {
    const callers = asked.get(key);
    if (callers) callers.push(resolve);
    else asked.set(key, [resolve]);
    if (reading) return;
    reading = true;
    setTimeout(() => void readAll(), 0);
  });

/**
 * Which pictures to forget: all whose key isn't `fresh` (another version's)
 * and, of the rest, the ones not shown the longest – beyond `most`.
 */
export const toForget = (
  kept: readonly { key: string; used: number }[],
  fresh: (key: string) => boolean,
  most = MOST
) => {
  const current = kept
    .filter(({ key }) => fresh(key))
    .sort((a, b) => b.used - a.used);
  return [
    ...kept.filter(({ key }) => !fresh(key)),
    ...current.slice(Math.max(0, most)),
  ].map(({ key }) => key);
};

let tidying: ReturnType<typeof setTimeout> | undefined;
let freshNow: (key: string) => boolean = () => true;

/** Away with what is too much, or old – one go, in a quiet moment. */
const tidy = async () => {
  try {
    const db = await open();
    if (!db) return;
    const tx = db.transaction([PICTURES, USED], "readwrite");
    const used = tx.objectStore(USED);
    const keys = used.getAllKeys();
    const times = used.getAll();
    // A picture without a time (written halfway) counts as the oldest.
    const pictures = tx.objectStore(PICTURES).getAllKeys();
    pictures.onsuccess = () => {
      const when = new Map<string, number>();
      (keys.result as string[]).forEach((key, i) => {
        when.set(key, Number(times.result[i]) || 0);
      });
      const kept = (pictures.result as string[]).map((key) => ({
        key,
        used: when.get(key) ?? 0,
      }));
      const gone = new Set(toForget(kept, freshNow));
      // A time left over without its picture goes too.
      const there = new Set(pictures.result as string[]);
      for (const key of when.keys()) if (!there.has(key)) gone.add(key);
      for (const key of gone) {
        tx.objectStore(PICTURES).delete(key);
        used.delete(key);
      }
    };
    await done(tx);
  } catch {
    // Next time.
  }
};

const idle = (then: () => void) => {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(then, { timeout: 2000 });
  } else then();
};

/**
 * Now – to keep a picture rendered from here on (`keepPicture`): if all is
 * forgotten meanwhile (a logout), it isn't.
 */
export const pictureEra = () => era;

/**
 * Keeps a picture – shown now, so the last to go. `fresh`: whether a key is
 * of the pictures' version now; the others go when it tidies up. `since`:
 * when it began to be rendered (`pictureEra`).
 */
export const keepPicture = (
  key: string,
  blob: Blob,
  fresh: (key: string) => boolean,
  since = era
) => {
  if (since !== era) return;
  freshNow = fresh;
  void (async () => {
    try {
      const [db, bytes] = await Promise.all([open(), blob.arrayBuffer()]);
      if (!db || since !== era) return;
      const tx = db.transaction([PICTURES, USED], "readwrite");
      tx.objectStore(PICTURES).put(bytes, key);
      tx.objectStore(USED).put(Date.now(), key);
      await done(tx);
    } catch {
      // Full, or not allowed: rendered again next time.
    }
  })();
  clearTimeout(tidying);
  tidying = setTimeout(() => idle(() => void tidy()), TIDY);
};

/** Every picture kept – with the rest of the device's copy (logout …). */
export const forgetPictures = async () => {
  era++;
  clearTimeout(tidying);
  try {
    const db = await open();
    if (!db) return;
    const tx = db.transaction([PICTURES, USED], "readwrite");
    tx.objectStore(PICTURES).clear();
    tx.objectStore(USED).clear();
    await done(tx);
  } catch {
    // Nothing kept, or nothing to be done.
  }
};

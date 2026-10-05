"use client";

/**
 * Original response files uploaded in the browser, kept in IndexedDB so the
 * buyer can reopen exactly what the vendor sent. (The sample RFx's files are
 * served from the server instead.)
 */
const DB_NAME = "rfx-copilot-files";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putFile(key: string, file: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(key: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function openStoredFile(key: string): Promise<boolean> {
  const blob = await getFile(key).catch(() => null);
  if (!blob) return false;
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
  return true;
}

/** Removes every stored file whose key starts with the prefix (e.g. all files of one RFx). */
export async function deleteFilesWithPrefix(prefix: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor(IDBKeyRange.bound(prefix, prefix + "\uffff"));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

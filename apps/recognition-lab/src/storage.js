const DB = 'recognition-lab-v1';
let database;
function open() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
    request.onblocked = () => { database = null; reject(new Error('Local library is blocked by another tab.')); };
  });
  return database;
}
async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', mode);
    const request = operation(tx.objectStore('sessions'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Local storage failed.'));
  });
}
export const saveSession = session => transaction('readwrite', store => store.put(structuredClone(session)));
export const loadSession = id => transaction('readonly', store => store.get(id));
export const deleteSession = id => transaction('readwrite', store => store.delete(id));
export async function listSessions() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly'), rows = [];
    const request = tx.objectStore('sessions').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const s = cursor.value;
      rows.push({ id: s.id, name: s.name, createdAt: s.createdAt, frames: s.samples.length });
      cursor.continue();
    };
    tx.oncomplete = () => resolve(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

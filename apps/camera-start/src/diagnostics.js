const KEY = 'camera-start:diagnostics:v1';
const LIMIT = 300;

/** Local state transitions only. Callers pass no image data, landmarks or coordinates. */
export function createDiagnostics(storage) {
  let events = [];
  try { storage ??= globalThis.localStorage; const saved = JSON.parse(storage.getItem(KEY)); if (Array.isArray(saved)) events = saved.slice(-LIMIT); } catch { /* Storage is optional. */ }
  const append = (event, detail = {}) => {
    events.push({ at: new Date().toISOString(), event, ...detail });
    events = events.slice(-LIMIT);
    try { storage.setItem(KEY, JSON.stringify(events)); } catch { /* In-memory export still works. */ }
  };
  return {
    append,
    entries: () => events.map(event => ({ ...event })),
    clear() { events = []; try { storage.removeItem(KEY); } catch { /* Optional persistence. */ } },
    export: () => JSON.stringify({ format: 'camera-start-diagnostics/1', exportedAt: new Date().toISOString(), events }, null, 2),
  };
}

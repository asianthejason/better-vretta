export type QuestionDraft<T = Record<string, unknown>> = {
  id: string;
  owner_id: string;
  assessment_id: string;
  question_id: string | null;
  status: "draft" | "published";
  snapshot: T;
  updated_at: string;
};

const fileCache = new WeakMap<Blob, Promise<string>>();
const urlCache = new Map<string, Promise<string>>();
function dataUrl(blob: Blob) {
  let result = fileCache.get(blob);
  if (!result) {
    result = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    fileCache.set(blob, result);
  }
  return result;
}

// Draft images must survive a reload even before the user uploads/publishes them.
export async function encodeDraft(value: unknown): Promise<unknown> {
  if (value instanceof File) return { __draftFile: true, name: value.name, type: value.type, lastModified: value.lastModified, data: await dataUrl(value) };
  if (typeof value === "string" && value.startsWith("blob:")) {
    let result = urlCache.get(value);
    if (!result) {
      result = fetch(value).then(response => response.blob()).then(dataUrl);
      urlCache.set(value, result);
    }
    return result;
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeDraft));
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await encodeDraft(entry)])));
  return value;
}

export async function decodeDraft<T>(value: unknown): Promise<T> {
  if (value && typeof value === "object" && "__draftFile" in value) {
    const file = value as unknown as { name: string; type: string; lastModified: number; data: string };
    const blob = await (await fetch(file.data)).blob();
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified }) as T;
  }
  if (Array.isArray(value)) return await Promise.all(value.map(entry => decodeDraft(entry))) as T;
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await decodeDraft(entry)]))) as T;
  return value as T;
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("question-editor-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function writeLocalDraft(record: QuestionDraft) {
  const db = await openDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const request = store.get(record.id);
      request.onsuccess = () => {
        if (!request.result || Date.parse(request.result.updated_at) <= Date.parse(record.updated_at)) store.put(record);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function readLocalDrafts(ownerId: string, assessmentId: string): Promise<QuestionDraft[]> {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").getAll();
      request.onsuccess = () => resolve((request.result as QuestionDraft[]).filter(row => row.owner_id === ownerId && row.assessment_id === assessmentId));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export function mergeQuestionDrafts(...lists: QuestionDraft[][]): QuestionDraft[] {
  const rows = new Map<string, QuestionDraft>();
  for (const list of lists) for (const row of list) {
    if (!rows.has(row.id) || Date.parse(rows.get(row.id)!.updated_at) <= Date.parse(row.updated_at)) rows.set(row.id, row);
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

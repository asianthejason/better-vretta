"use client";

import { useEffect, useRef, useState } from "react";
import { hydratePrivateImageUrls } from "@/lib/privateImageUrls";
import { supabase } from "@/lib/supabaseClient";
import { decodeDraft, encodeDraft, mergeQuestionDrafts, readLocalDrafts, writeLocalDraft, type QuestionDraft } from "@/lib/questionDrafts";

export function useQuestionDrafts<T extends Record<string, unknown>>({ ownerId, assessmentId, snapshot, enabled }: {
  ownerId: string; assessmentId: string; snapshot: T; enabled: boolean;
}) {
  const [records, setRecords] = useState<QuestionDraft[]>([]);
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useRef<{ id: string; questionId: string | null } | null>(null);
  const latest = useRef<QuestionDraft<T> | null>(null);
  const localQueue = useRef<Promise<void>>(Promise.resolve());
  const remoteQueue = useRef<Promise<void>>(Promise.resolve());
  const lastLocal = useRef(new Map<string, string>());
  const lastTimestamp = useRef(0);
  const lastRemote = useRef(new Map<string, string>());
  const pendingRemote = useRef(new Map<string, QuestionDraft<T>>());
  const pendingLocal = useRef(0);
  const sequence = useRef(0);

  function store(record: QuestionDraft<T>) {
    const revision = ++sequence.current;
    pendingLocal.current++;
    setMessage("Saving draft…");
    const work = localQueue.current.then(async () => {
      const encoded = { ...record, snapshot: await encodeDraft(record.snapshot) as Record<string, unknown> };
      await writeLocalDraft(encoded);
      lastLocal.current.set(record.id, record.updated_at);
      setRecords(current => mergeQuestionDrafts(current, [encoded]));
      if (sequence.current === revision) setMessage("Draft saved on this device");
    });
    localQueue.current = work.catch(() => {
      if (sequence.current === revision) setMessage("Draft could not be saved on this device. Keep this editor open and retry.");
    }).finally(() => { pendingLocal.current--; });
    return work;
  }

  function sync(record = latest.current): Promise<void> {
    if (!record) return Promise.resolve();
    const pending = pendingRemote.current.get(record.id);
    if (!pending || Date.parse(pending.updated_at) <= Date.parse(record.updated_at)) pendingRemote.current.set(record.id, record);
    const work = remoteQueue.current.then(async () => {
      if (lastRemote.current.get(record.id) === record.updated_at) {
        if (pendingRemote.current.get(record.id)?.updated_at === record.updated_at) pendingRemote.current.delete(record.id);
        return;
      }
      const encoded = { ...record, snapshot: await encodeDraft(record.snapshot) };
      const { error } = await supabase.from("question_drafts").upsert(encoded);
      if (error) throw new Error(error.message);
      lastRemote.current.set(record.id, record.updated_at);
      if (pendingRemote.current.get(record.id)?.updated_at === record.updated_at) pendingRemote.current.delete(record.id);
      if (latest.current?.updated_at === record.updated_at) setMessage("Draft saved");
    });
    remoteQueue.current = work.catch(() => {
      if (latest.current?.updated_at === record.updated_at) setMessage(lastLocal.current.get(record.id) === record.updated_at ? "Saved on this device. Cloud save unavailable; retrying automatically." : "Draft could not be saved. Keep this editor open and retry.");
    });
    return remoteQueue.current;
  }

  useEffect(() => {
    if (!ownerId || !assessmentId) return;
    let cancelled = false;
    void (async () => {
      const local = await readLocalDrafts(ownerId, assessmentId).catch(() => []);
      if (!cancelled) setRecords(current => mergeQuestionDrafts(current, local));
      const { data } = await supabase.from("question_drafts").select("*").eq("assessment_id", assessmentId).eq("owner_id", ownerId);
      const merged = mergeQuestionDrafts(local, (data || []) as QuestionDraft[]);
      if (cancelled) return;
      setRecords(current => mergeQuestionDrafts(current, merged));
      // Recover offline saves, including publication tombstones, without restoring editor state.
      for (const record of merged) {
        void writeLocalDraft(record).catch(() => {});
        const remote = (data || []).find((row: QuestionDraft) => row.id === record.id);
        if (!remote || Date.parse(remote.updated_at) < Date.parse(record.updated_at)) void sync(record as QuestionDraft<T>);
      }
    })();
    return () => { cancelled = true; };
    // Loading is scoped to the account/assessment, never to editor changes.
  }, [ownerId, assessmentId]);

  useEffect(() => {
    if (!enabled || !ownerId || !assessmentId || !active.current) return;
    const record: QuestionDraft<T> = {
      id: active.current.id, owner_id: ownerId, assessment_id: assessmentId,
      question_id: active.current.questionId, status: "draft", snapshot,
      updated_at: timestamp(),
    };
    latest.current = record;
    void store(record).catch(() => {});
    const timer = setTimeout(() => void sync(record), 1500);
    return () => clearTimeout(timer);
    // Snapshot is memoized by the editor; save completions never change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, enabled, activeId, ownerId, assessmentId]);

  useEffect(() => {
    const flush = () => {
      for (const record of pendingRemote.current.values()) void sync(record);
      void sync();
    };
    const interval = setInterval(flush, 5000);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingLocal.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("online", flush);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", flush);
      window.removeEventListener("beforeunload", beforeUnload);
      void sync();
    };
    // The queues and latest snapshot are refs, so these handlers never use stale state.
  }, []);

  function timestamp() {
    lastTimestamp.current = Math.max(Date.now(), lastTimestamp.current + 1);
    return new Date(lastTimestamp.current).toISOString();
  }
  function begin(questionId: string | null = null, id = crypto.randomUUID()) {
    active.current = { id, questionId };
    latest.current = null;
    setActiveId(id);
    setMessage("");
  }
  async function restore(record: QuestionDraft) {
    const hydrated = await hydratePrivateImageUrls(supabase, record.snapshot).catch(() => record.snapshot);
    const restored = await decodeDraft<T>(hydrated);
    lastTimestamp.current = Math.max(lastTimestamp.current, Date.parse(record.updated_at));
    begin(record.question_id, record.id);
    return restored;
  }
  async function save(waitForCloud = true) {
    const record = latest.current;
    await localQueue.current;
    if (record && lastLocal.current.get(record.id) !== record.updated_at) await store(record);
    if (waitForCloud) await sync(record);
    else void sync(record);
  }
  async function complete() {
    const record = latest.current;
    if (!record) return;
    const completed = { ...record, status: "published" as const, snapshot: {} as T, updated_at: timestamp() };
    latest.current = completed;
    await store(completed);
    await sync(completed);
    active.current = null;
    setActiveId(null);
  }
  async function remove(record: QuestionDraft) {
    setRemovingIds(current => new Set(current).add(record.id));
    lastTimestamp.current = Math.max(lastTimestamp.current, Date.parse(record.updated_at));
    // Reuse the terminal tombstone so stale offline copies cannot restore deleted work.
    // This only changes the draft record; it never publishes or deletes a question.
    const removed = { ...record, status: "published" as const, snapshot: {} as T, updated_at: timestamp() };
    try {
      await store(removed);
    } finally {
      // On failure the original record becomes visible again; on success the
      // persisted tombstone already keeps it out of the list.
      setRemovingIds(current => {
        const next = new Set(current);
        next.delete(record.id);
        return next;
      });
    }
    if (active.current?.id === record.id) {
      latest.current = removed;
      active.current = null;
      setActiveId(null);
    }
    void sync(removed);
  }
  return { records: records.filter(record => record.status === "draft" && !removingIds.has(record.id)), message, activeId, begin, restore, save, complete, remove };
}

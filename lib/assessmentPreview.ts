export type AssessmentPreviewOrigin = "dashboard" | "editor" | "run";

export function assessmentPreviewHref(id: string, from: AssessmentPreviewOrigin) {
  return `/student/${encodeURIComponent(id)}?preview=1&from=${from}`;
}

export function assessmentPreviewExitHref(id: string, from: string | null) {
  const editor = `/teacher/assessments/${encodeURIComponent(id)}`;
  if (from === "editor") return editor;
  if (from === "run") return `${editor}/results`;
  return "/teacher";
}

export const ASSESSMENT_PRESENCE_TIMEOUT_MS = 30_000;

export function assessmentSessionIsPresent(
  lastActivityAt: string | null | undefined,
  now = Date.now(),
) {
  if (!lastActivityAt) return false;
  const lastActivity = Date.parse(lastActivityAt);
  return Number.isFinite(lastActivity)
    && lastActivity <= now + 5_000
    && now - lastActivity <= ASSESSMENT_PRESENCE_TIMEOUT_MS;
}

export type AssessmentRoomState = "not-entered" | "left" | "waiting" | "active" | "blocked" | "submitted";

export function assessmentRoomState(
  runStatus: "waiting" | "live" | "ended",
  sessionStatus: "waiting" | "active" | "blocked" | "submitted" | undefined,
  isPresent: boolean,
): AssessmentRoomState {
  if (!sessionStatus) return "not-entered";
  if (sessionStatus === "submitted") return "submitted";
  if (!isPresent) return "left";
  if (runStatus !== "live") return "waiting";
  if (sessionStatus === "blocked") return "blocked";
  return sessionStatus === "active" ? "active" : "waiting";
}

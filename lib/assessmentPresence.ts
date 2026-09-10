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

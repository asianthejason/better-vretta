export const LOCKDOWN_FRAME_GAP_MS = 1500;

export function lockdownPageLostFocus(visibilityState: DocumentVisibilityState, hasFocus: boolean) {
  return visibilityState !== "visible" || !hasFocus;
}

export function lockdownFrameWasInterrupted(frameGapMs: number) {
  return frameGapMs > LOCKDOWN_FRAME_GAP_MS;
}

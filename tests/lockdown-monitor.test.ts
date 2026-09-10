import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCKDOWN_FRAME_GAP_MS, lockdownFrameWasInterrupted, lockdownPageLostFocus } from "../lib/lockdownMonitor";

test("lockdown detects hidden pages and windows that lost focus", () => {
  assert.equal(lockdownPageLostFocus("visible", true), false);
  assert.equal(lockdownPageLostFocus("visible", false), true);
  assert.equal(lockdownPageLostFocus("hidden", true), true);
});

test("lockdown detects an interrupted rendering heartbeat", () => {
  assert.equal(lockdownFrameWasInterrupted(LOCKDOWN_FRAME_GAP_MS), false);
  assert.equal(lockdownFrameWasInterrupted(LOCKDOWN_FRAME_GAP_MS + 1), true);
});

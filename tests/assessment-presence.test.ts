import assert from "node:assert/strict";
import test from "node:test";
import { ASSESSMENT_PRESENCE_TIMEOUT_MS, assessmentSessionIsPresent } from "../lib/assessmentPresence";

test("assessment presence expires after the heartbeat timeout", () => {
  const now = Date.parse("2026-09-09T20:00:00.000Z");

  assert.equal(assessmentSessionIsPresent(new Date(now - 5_000).toISOString(), now), true);
  assert.equal(assessmentSessionIsPresent(new Date(now - ASSESSMENT_PRESENCE_TIMEOUT_MS).toISOString(), now), true);
  assert.equal(assessmentSessionIsPresent(new Date(now - ASSESSMENT_PRESENCE_TIMEOUT_MS - 1).toISOString(), now), false);
  assert.equal(assessmentSessionIsPresent(null, now), false);
});

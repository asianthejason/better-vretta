import assert from "node:assert/strict";
import test from "node:test";
import { assessmentPreviewHref, assessmentPreviewExitHref } from "../lib/assessmentPreview";

test("preview returns to its dashboard, editor, or run entry page", () => {
  for (const [origin, destination] of [["dashboard", "/teacher"], ["editor", "/teacher/assessments/123"], ["run", "/teacher/assessments/123/results"]] as const) {
    const url = new URL(assessmentPreviewHref("123", origin), "http://localhost");
    assert.equal(url.searchParams.get("preview"), "1");
    assert.equal(assessmentPreviewExitHref("123", url.searchParams.get("from")), destination);
  }
});

test("old preview links and unknown origins fall back to the dashboard", () => {
  for (const origin of [null, "", "https://example.com", "//example.com"]) {
    assert.equal(assessmentPreviewExitHref("123", origin), "/teacher");
  }
});

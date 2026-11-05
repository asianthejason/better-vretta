import assert from "node:assert/strict";
import test from "node:test";
import { siteUrl } from "../lib/siteUrl";

test("production authentication callbacks use the canonical domain", () => {
  assert.equal(
    siteUrl("/login?teacher=1", "https://better-vretta-preview.vercel.app", "production"),
    "https://cloneretta.com/login?teacher=1",
  );
});

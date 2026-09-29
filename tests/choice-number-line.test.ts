import test from "node:test";
import assert from "node:assert/strict";
import { buildChoiceNumberLineHtml, DEFAULT_CHOICE_NUMBER_LINE, parseChoiceNumberLine } from "../lib/choiceNumberLine";
import { getSingleLineChoiceBoxSize } from "../lib/dragDrop";

test("choice number lines persist settings and render fractional ticks and plotted points", () => {
  const config = { ...DEFAULT_CHOICE_NUMBER_LINE, min: -1, max: 1, increment: 0.5, points: [-0.5, 1] };
  const html = buildChoiceNumberLineHtml(config);
  const saved = html.match(/data-choice-number-line="([^"]+)"/)![1].replaceAll("&quot;", '"');
  assert.deepEqual(parseChoiceNumberLine(saved), config);
  assert.match(html, />-0.5<\/text>/);
  assert.equal((html.match(/<circle /g) || []).length, 2);
  assert.match(html, /contenteditable="false"/);
});

test("choice number lines reject malformed, excessive, and out-of-range settings", () => {
  for (const patch of [{ max: -5 }, { increment: 0 }, { increment: 0.00001 }, { points: [6] }, { points: ["<script>"] }, { showLabels: "yes" }, { labelEvery: 1.5 }]) {
    assert.equal(parseChoiceNumberLine(JSON.stringify({ ...DEFAULT_CHOICE_NUMBER_LINE, ...patch })), null);
  }
  assert.equal(parseChoiceNumberLine("invalid"), null);
});

test("choice number line label and arrow toggles persist without removing ticks", () => {
  const html = buildChoiceNumberLineHtml({ ...DEFAULT_CHOICE_NUMBER_LINE, showLabels: false, showArrows: false });
  assert.doesNotMatch(html, /<text |<path /);
  assert.match(html, /<line /);
  assert.match(html, /<title>Number line from -5 to 5/);
});

test("choice boxes reserve space for number lines and multi-select markers", () => {
  const items = [{ id: "a", content: "", html: buildChoiceNumberLineHtml(DEFAULT_CHOICE_NUMBER_LINE) }, { id: "b", content: "2" }];
  const size = getSingleLineChoiceBoxSize(items);
  assert.ok(size.width >= 364);
  assert.equal(size.height, 80);
  assert.equal(getSingleLineChoiceBoxSize(items, { selectionMode: "multiple" }).width, size.width + 28);
});

test("decimal inequality rays preserve direction, endpoint style, extensions and label offsets", () => {
  for (const direction of ["left", "right"] as const) for (const closed of [false, true]) {
    const config = { ...DEFAULT_CHOICE_NUMBER_LINE, min: 2, max: 2.6, increment: 0.05, labelEvery: 2, labelOffset: 1, arrowExtensionPercent: 6, ray: { value: 2.15, direction, closed } };
    const html = buildChoiceNumberLineHtml(config);
    const saved = html.match(/data-choice-number-line="([^"]+)"/)![1].replaceAll("&quot;", '"');
    assert.deepEqual(parseChoiceNumberLine(saved), config);
    assert.match(html, new RegExp(`data-number-line-ray="${direction}"`));
    assert.match(html, new RegExp(`data-ray-endpoint="${closed ? "closed" : "open"}"`));
    assert.deepEqual([...html.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(match => match[1]), ["2.05", "2.15", "2.25", "2.35", "2.45", "2.55"]);
    assert.match(html, /x1="120"/); // First tick is inset beyond the axis arrow.
    assert.match(html, new RegExp(`fill="${closed ? "currentColor" : "white"}"/></g>`));
  }
});

test("invalid rays and unsafe new attributes cannot become SVG markup", () => {
  for (const patch of [
    { ray: { value: 6, direction: "left", closed: false } },
    { ray: { value: 0, direction: '<script>', closed: false } },
    { ray: { value: 0, direction: "left", closed: "yes" } },
    { arrowExtensionPercent: 26 }, { labelOffset: -1 }, { labelOffset: 1.5 },
  ]) assert.equal(parseChoiceNumberLine(JSON.stringify({ ...DEFAULT_CHOICE_NUMBER_LINE, ...patch })), null);
});

test("multiple rays and specific labels survive serialization together", () => {
  const config = { ...DEFAULT_CHOICE_NUMBER_LINE, labelMode: "specific" as const, labelValues: [-4, 0, 2.5], rays: [{ value: -2, direction: "left" as const, closed: false }, { value: 2, direction: "right" as const, closed: true }] };
  const html = buildChoiceNumberLineHtml(config);
  const saved = html.match(/data-choice-number-line="([^"]+)"/)![1].replaceAll("&quot;", '"');
  assert.deepEqual(parseChoiceNumberLine(saved), config);
  assert.deepEqual([...html.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(match => match[1]).sort(), ["-4", "0", "2.5"]);
  assert.equal((html.match(/data-number-line-ray=/g) || []).length, 2);
  assert.equal((html.match(/data-ray-endpoint=/g) || []).length, 2);
  assert.ok(html.lastIndexOf("data-number-line-ray=") < html.indexOf("data-ray-endpoint="));
});

test("explicit empty rays override legacy rays and interval labels follow the interval exactly", () => {
  const config = { ...DEFAULT_CHOICE_NUMBER_LINE, min: 0, max: 5, labelEvery: 2, ray: { value: 2, direction: "left" as const, closed: false }, rays: [] };
  const html = buildChoiceNumberLineHtml(config);
  assert.doesNotMatch(html, /data-number-line-ray=/);
  assert.deepEqual([...html.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(match => match[1]), ["0", "2", "4"]);
});

test("invalid custom labels and ray lists are rejected", () => {
  for (const patch of [
    { labelMode: "other" }, { labelValues: [6] }, { labelValues: ["<script>"] },
    { rays: [{ value: -6, direction: "left", closed: false }] }, { rays: [null] },
    { rays: "invalid" }, { rays: Array(201).fill({ value: 0, direction: "left", closed: false }) },
  ]) assert.equal(parseChoiceNumberLine(JSON.stringify({ ...DEFAULT_CHOICE_NUMBER_LINE, ...patch })), null);
});

 test("number-line SVG descriptions do not inflate the choice width", () => {
  const html = buildChoiceNumberLineHtml({ ...DEFAULT_CHOICE_NUMBER_LINE, rays: [{ value: 2, direction: "left", closed: false }, { value: 4, direction: "right", closed: true }] });
  const text = html.replace(/<[^>]*>/g, "");
  const size = getSingleLineChoiceBoxSize([{ id: "line", content: text, html }]);
  assert.equal(size.width, 364);
  assert.equal(size.height, 80);
  assert.match(html, /viewBox="0 58 1000 112"/);
});

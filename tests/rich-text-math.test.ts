import assert from "node:assert/strict";
import test from "node:test";
import { buildRootMathHtml, buildStructuredMathHtml, type StructuredMathValues } from "../lib/mathExpressions";

const values: StructuredMathValues = {
  lower: "i = 1",
  upper: "n",
  expression: "aᵢ",
  variable: "x",
  approach: "0",
  numerator: "a < b",
  denominator: "c & d",
};

test("bounded operators include their limits and expression", () => {
  const summation = buildStructuredMathHtml("summation", values);
  assert.match(summation, /<munderover><mo>∑<\/mo>/);
  assert.match(summation, /i = 1/);
  assert.match(summation, /<mtext>n<\/mtext>/);
  assert.match(summation, /aᵢ/);
});

test("integrals include bounds, integrand, and differential", () => {
  const integral = buildStructuredMathHtml("integral", values);
  assert.match(integral, /<mo>∫<\/mo>/);
  assert.match(integral, /<mtext>aᵢ<\/mtext><mrow><mi>d<\/mi><mtext>x<\/mtext><\/mrow>/);
});

test("structured math escapes user-entered markup", () => {
  const fraction = buildStructuredMathHtml("fraction", values);
  assert.match(fraction, /a &lt; b/);
  assert.match(fraction, /c &amp; d/);
  assert.doesNotMatch(fraction, /a < b/);
});

test("roots use structured notation for both square and indexed roots", () => {
  assert.match(buildRootMathHtml("2", "x + 1"), /<msqrt><mtext>x \+ 1<\/mtext><\/msqrt>/);
  assert.match(buildRootMathHtml("3", "8"), /<mroot><mtext>8<\/mtext><mtext>3<\/mtext><\/mroot>/);
});

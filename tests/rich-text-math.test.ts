import assert from "node:assert/strict";
import test from "node:test";
import { buildRootMathHtml, buildStructuredMathHtml, normalizeFractionParentheses, readFractionMathValues, type StructuredMathValues } from "../lib/mathExpressions";

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
  assert.match(summation, /<mpadded height="\+0\.24em" voffset="0\.18em"><mtext>n<\/mtext><\/mpadded>/);
  assert.match(summation, /aᵢ/);

  const product = buildStructuredMathHtml("product", values);
  assert.match(product, /<mpadded height="\+0\.24em" voffset="0\.18em"><mtext>n<\/mtext><\/mpadded>/);
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

test("fractions support full-height brackets and elevated exponents", () => {
  const fractionWithBrackets = buildStructuredMathHtml("fraction", {
    ...values,
    brackets: "parentheses",
  });
  assert.match(fractionWithBrackets, /<mrow><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\(<\/mo><mfrac>/);
  assert.match(fractionWithBrackets, /<\/mfrac><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\)<\/mo><\/mrow>/);

  const fractionWithExponent = buildStructuredMathHtml("fraction", {
    ...values,
    brackets: "parentheses",
    exponent: "4",
  });
  assert.match(fractionWithExponent, /<msup><mrow><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\(<\/mo><mfrac>/);
  assert.match(fractionWithExponent, /<\/mrow><mpadded voffset="-0\.22em"><mtext>4<\/mtext><\/mpadded><\/msup>/);

  const fractionWithSquareBrackets = buildStructuredMathHtml("fraction", {
    ...values,
    brackets: "brackets",
    exponent: "n + 1",
  });
  assert.match(fractionWithSquareBrackets, /<msup><mrow><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\[<\/mo><mfrac>/);
  assert.match(fractionWithSquareBrackets, /<\/mrow><mpadded voffset="-0\.22em"><mtext>n \+ 1<\/mtext><\/mpadded><\/msup>/);
});

test("normalizeFractionParentheses transforms typed brackets and exponents around fractions into structured MathML", () => {
  const rawHtmlWithSup = `Another representation of the expression ( <math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true"><mfrac><mtext>2</mtext><mtext>3</mtext></mfrac></mstyle></math> )<sup>4</sup> is `;
  const normalized = normalizeFractionParentheses(rawHtmlWithSup);
  assert.match(normalized, /<msup><mrow><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\(<\/mo><mfrac><mtext>2<\/mtext><mtext>3<\/mtext><\/mfrac><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\)<\/mo><\/mrow><mpadded voffset="-0\.22em"><mtext>4<\/mtext><\/mpadded><\/msup>/);
  assert.doesNotMatch(normalized, /\(\s*<math/);
  assert.doesNotMatch(normalized, /<\/math>\s*\)/);
  assert.doesNotMatch(normalized, /<sup>4<\/sup>/);

  // Idempotency: normalizing twice produces same output
  assert.equal(normalizeFractionParentheses(normalized), normalized);

  // Unicode superscript handling
  const rawWithUnicode = `(<math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true"><mfrac><mtext>2</mtext><mtext>3</mtext></mfrac></mstyle></math>)⁴`;
  const normalizedUnicode = normalizeFractionParentheses(rawWithUnicode);
  assert.match(normalizedUnicode, /<msup><mrow><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\(<\/mo><mfrac><mtext>2<\/mtext><mtext>3<\/mtext><\/mfrac><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\)<\/mo><\/mrow><mpadded voffset="-0\.22em"><mtext>4<\/mtext><\/mpadded><\/msup>/);

  // Plain brackets without exponent
  const rawSquare = `[ <math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true"><mfrac><mtext>a</mtext><mtext>b</mtext></mfrac></mstyle></math> ]`;
  const normalizedSquare = normalizeFractionParentheses(rawSquare);
  assert.match(normalizedSquare, /<mrow><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\[<\/mo><mfrac><mtext>a<\/mtext><mtext>b<\/mtext><\/mfrac><mo fence="true" stretchy="true" symmetric="true" minsize="2em">\]<\/mo><\/mrow>/);
});

test("an exponent added after a rendered bracketed fraction joins the fraction", () => {
  const renderedFraction = buildStructuredMathHtml("fraction", {
    ...values,
    numerator: "2",
    denominator: "3",
    brackets: "parentheses",
  });
  const normalized = normalizeFractionParentheses(`${renderedFraction}<sup>4</sup> is`);

  assert.match(normalized, /<msup><mrow>[\s\S]*?<mfrac><mtext>2<\/mtext><mtext>3<\/mtext><\/mfrac>[\s\S]*?<\/mrow><mpadded voffset="-0\.22em"><mtext>4<\/mtext><\/mpadded><\/msup>/);
  assert.doesNotMatch(normalized, /<\/math><sup>4<\/sup>/);
  assert.match(normalized, /<\/math> is$/);
});

test("previously saved bracketed fractions are upgraded on load", () => {
  const legacy = `<math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true"><msup><mrow><mo stretchy="true">(</mo><mfrac><mtext>2</mtext><mtext>3</mtext></mfrac><mo stretchy="true">)</mo></mrow><mtext>4</mtext></msup></mstyle></math>`;
  const normalized = normalizeFractionParentheses(legacy);

  assert.match(normalized, /<mo fence="true" stretchy="true" symmetric="true" minsize="2em">\(<\/mo>/);
  assert.match(normalized, /<mpadded voffset="-0\.22em"><mtext>4<\/mtext><\/mpadded>/);
});

test("rendered fraction values can be reopened for editing", () => {
  const attributes = new Map([["data-math-expression", "fraction"]]);
  const fraction = {
    children: [{ textContent: "2" }, { textContent: "3" }],
  };
  const math = {
    getAttribute: (name: string) => attributes.get(name) || null,
    querySelector: (selector: string) => {
      if (selector === "mfrac") return fraction;
      if (selector === "mo") return { textContent: "(" };
      if (selector.includes("msup")) return { textContent: "4" };
      return null;
    },
  } as unknown as Element;

  assert.deepEqual(readFractionMathValues(math), {
    lower: "i = 1",
    upper: "n",
    expression: "",
    variable: "x",
    approach: "0",
    numerator: "2",
    denominator: "3",
    brackets: "parentheses",
    exponent: "4",
  });
});

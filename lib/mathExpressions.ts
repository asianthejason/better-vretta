import { buildMathExpressionHtml, decodeMathExpressionTree } from "./mathExpressionTree";

export type StructuredMathKind = "summation" | "product" | "integral" | "limit" | "fraction";

export type StructuredMathValues = {
  lower: string;
  upper: string;
  expression: string;
  variable: string;
  approach: string;
  numerator: string;
  denominator: string;
  brackets?: "none" | "parentheses" | "brackets";
  exponent?: string;
};

export function readFractionMathValues(math: Element): StructuredMathValues | null {
  if (math.getAttribute("data-math-expression") !== "fraction") return null;
  const fraction = math.querySelector("mfrac");
  if (!fraction || fraction.children.length < 2) return null;
  const openingFence = math.querySelector("mo")?.textContent?.trim();
  const exponent = math.querySelector("msup > mpadded mtext, msup > mtext")?.textContent?.trim() || "";
  return {
    lower: "i = 1",
    upper: "n",
    expression: "",
    variable: "x",
    approach: "0",
    numerator: fraction.children[0]?.textContent || "",
    denominator: fraction.children[1]?.textContent || "",
    brackets: openingFence === "[" ? "brackets" : openingFence === "(" ? "parentheses" : "none",
    exponent,
  };
}

const UNICODE_SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")",
  "ⁿ": "n", "ⁱ": "i", "ᵃ": "a", "ᵇ": "b", "ˣ": "x", "ʸ": "y",
};

export function decodeUnicodeSuperscript(str: string) {
  return str.split("").map((ch) => UNICODE_SUPERSCRIPTS[ch] || ch).join("");
}

export function normalizeFractionParentheses(html: string): string {
  // Re-render saved expression trees so older radical markup receives layout fixes.
  html = html.replace(/<math\b[^>]*data-math-tree="([^"]+)"[^>]*>[\s\S]*?<\/math>/g, (original, encoded) => {
    const tree = decodeMathExpressionTree(encoded);
    return tree ? buildMathExpressionHtml(tree) : original;
  });
  if (!html || !html.includes('data-math-expression="fraction"')) return html;

  const pattern = /([(\[{])\s*(?:&nbsp;|\u200B)?\s*(<math\b[^>]*data-math-expression="fraction"[^>]*>[\s\S]*?<\/math>)\s*(?:&nbsp;|\u200B)?\s*([)\]}])\s*(?:<sup>([\s\S]*?)<\/sup>|\^([0-9a-zA-Z+-]+)|([¹²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱᵃᵇˣʸ]+))?/g;

  const bracketedHtml = html.replace(pattern, (match, open, mathHtml, close, supExp, caretExp, unicodeExp) => {
    // Ensure matching bracket types
    if ((open === "(" && close !== ")") || (open === "[" && close !== "]") || (open === "{" && close !== "}")) {
      return match;
    }

    const fracMatch = mathHtml.match(/<mfrac>[\s\S]*?<\/mfrac>/);
    if (!fracMatch) return match;

    const fracContent = fracMatch[0];
    let exponent = "";
    if (supExp !== undefined) {
      exponent = supExp.replace(/<[^>]+>/g, "").trim();
    } else if (caretExp !== undefined) {
      exponent = caretExp.trim();
    } else if (unicodeExp !== undefined) {
      exponent = decodeUnicodeSuperscript(unicodeExp).trim();
    }

    const bracketedFrac = `<mrow>${fractionFence(open)}${fracContent}${fractionFence(close)}</mrow>`;
    const inner = exponent
      ? `<msup>${bracketedFrac}${fractionExponent(exponent)}</msup>`
      : bracketedFrac;

    return `<math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true">${inner}</mstyle></math>`;
  });

  // A teacher may add an exponent after a bracketed fraction has already
  // rendered. Fold that trailing script into the existing MathML as well.
  const withTrailingExponents = bracketedHtml.replace(
    /(<math\b[^>]*data-math-expression="fraction"[^>]*>[\s\S]*?<\/math>)\s*(?:<sup>([\s\S]*?)<\/sup>|\^([0-9a-zA-Z+-]+)|([¹²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱᵃᵇˣʸ]+))/g,
    (match, mathHtml, supExp, caretExp, unicodeExp) => {
      if (/<msup\b/.test(mathHtml)) return match;
      const exponent = supExp !== undefined
        ? supExp.replace(/<[^>]+>/g, "").trim()
        : caretExp !== undefined
          ? caretExp.trim()
          : decodeUnicodeSuperscript(unicodeExp || "").trim();
      if (!exponent || !/<mrow>[\s\S]*?<mfrac>[\s\S]*?<\/mfrac>[\s\S]*?<\/mrow>/.test(mathHtml)) return match;
      return mathHtml.replace(
        /(<mstyle\b[^>]*>)([\s\S]*)(<\/mstyle>)/,
        (_match: string, start: string, contents: string, end: string) =>
          `${start}<msup>${contents}${fractionExponent(exponent)}</msup>${end}`,
      );
    },
  );

  // Upgrade fractions saved by the earlier implementation when they are
  // loaded, so teachers do not need to delete and recreate them.
  return withTrailingExponents.replace(
    /<math\b[^>]*data-math-expression="fraction"[^>]*>[\s\S]*?<\/math>/g,
    (mathHtml) => mathHtml
      .replace(/<mo\b[^>]*>\s*([()\[\]{}])\s*<\/mo>/g, (_, fence) => fractionFence(fence))
      .replace(/(<msup><mrow>[\s\S]*?<\/mrow>)(<mtext>[\s\S]*?<\/mtext>)(<\/msup>)/g, `$1<mpadded voffset="-0.22em">$2</mpadded>$3`),
  );
}

const escapeMathText = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const text = (value: string, fallback: string) => `<mtext>${escapeMathText(value.trim() || fallback)}</mtext>`;

const fractionFence = (value: string) =>
  `<mo fence="true" stretchy="true" symmetric="true" minsize="2em">${value}</mo>`;

const fractionExponent = (value: string) =>
  `<mpadded voffset="-0.22em">${text(value, "n")}</mpadded>`;

export function buildRootMathHtml(index: string, value: string) {
  const rootContent = text(value, "value");
  const root = index.trim() === "2"
    ? `<msqrt>${rootContent}</msqrt>`
    : `<mroot>${rootContent}${text(index, "n")}</mroot>`;
  return `<math data-math-expression="root" contenteditable="false"><mstyle displaystyle="true">${root}</mstyle></math>`;
}

export function buildStructuredMathHtml(kind: StructuredMathKind, values: StructuredMathValues) {
  if (kind === "fraction") {
    const frac = `<mfrac>${text(values.numerator, "numerator")}${text(values.denominator, "denominator")}</mfrac>`;
    const bracketStyle = values.brackets ?? (values.exponent?.trim() ? "parentheses" : "none");
    const open = bracketStyle === "brackets" ? "[" : "(";
    const close = bracketStyle === "brackets" ? "]" : ")";
    const bracketed = bracketStyle !== "none"
      ? `<mrow>${fractionFence(open)}${frac}${fractionFence(close)}</mrow>`
      : frac;
    const exponent = values.exponent?.trim();
    const withExponent = exponent
      ? `<msup>${bracketed}${fractionExponent(exponent)}</msup>`
      : bracketed;
    return `<math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true">${withExponent}</mstyle></math>`;
  }

  if (kind === "limit") {
    return `<math data-math-expression="limit" contenteditable="false"><mstyle displaystyle="true"><munder><mo>lim</mo><mrow>${text(values.variable, "x")}<mo>→</mo>${text(values.approach, "0")}</mrow></munder>${text(values.expression, "f(x)")}</mstyle></math>`;
  }

  const operator = kind === "summation" ? "∑" : kind === "product" ? "∏" : "∫";
  const expression = text(values.expression, kind === "integral" ? "f(x)" : "expression");
  const differential = kind === "integral" ? `<mrow><mi>d</mi>${text(values.variable, "x")}</mrow>` : "";
  const upper = text(values.upper, kind === "integral" ? "b" : "n");
  const spacedUpper = kind === "integral"
    ? upper
    : `<mpadded height="+0.24em" voffset="0.18em">${upper}</mpadded>`;
  return `<math data-math-expression="${kind}" contenteditable="false"><mstyle displaystyle="true"><munderover><mo>${operator}</mo>${text(values.lower, kind === "integral" ? "a" : "i = 1")}${spacedUpper}</munderover>${expression}${differential}</mstyle></math>`;
}

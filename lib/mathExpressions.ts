export type StructuredMathKind = "summation" | "product" | "integral" | "limit" | "fraction";

export type StructuredMathValues = {
  lower: string;
  upper: string;
  expression: string;
  variable: string;
  approach: string;
  numerator: string;
  denominator: string;
};

const escapeMathText = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const text = (value: string, fallback: string) => `<mtext>${escapeMathText(value.trim() || fallback)}</mtext>`;

export function buildRootMathHtml(index: string, value: string) {
  const rootContent = text(value, "value");
  const root = index.trim() === "2"
    ? `<msqrt>${rootContent}</msqrt>`
    : `<mroot>${rootContent}${text(index, "n")}</mroot>`;
  return `<math data-math-expression="root" contenteditable="false"><mstyle displaystyle="true">${root}</mstyle></math>`;
}

export function buildStructuredMathHtml(kind: StructuredMathKind, values: StructuredMathValues) {
  if (kind === "fraction") {
    return `<math data-math-expression="fraction" contenteditable="false"><mstyle displaystyle="true"><mfrac>${text(values.numerator, "numerator")}${text(values.denominator, "denominator")}</mfrac></mstyle></math>`;
  }

  if (kind === "limit") {
    return `<math data-math-expression="limit" contenteditable="false"><mstyle displaystyle="true"><munder><mo>lim</mo><mrow>${text(values.variable, "x")}<mo>→</mo>${text(values.approach, "0")}</mrow></munder>${text(values.expression, "f(x)")}</mstyle></math>`;
  }

  const operator = kind === "summation" ? "∑" : kind === "product" ? "∏" : "∫";
  const expression = text(values.expression, kind === "integral" ? "f(x)" : "expression");
  const differential = kind === "integral" ? `<mrow><mi>d</mi>${text(values.variable, "x")}</mrow>` : "";
  return `<math data-math-expression="${kind}" contenteditable="false"><mstyle displaystyle="true"><munderover><mo>${operator}</mo>${text(values.lower, kind === "integral" ? "a" : "i = 1")}${text(values.upper, kind === "integral" ? "b" : "n")}</munderover>${expression}${differential}</mstyle></math>`;
}

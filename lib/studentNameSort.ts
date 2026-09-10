const nameCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function studentNameParts(name: string | null | undefined, fallback = "") {
  const normalized = (name?.trim() || fallback.trim()).replace(/\s+/g, " ");
  if (!normalized) return { last: "", first: "", full: "" };

  const commaIndex = normalized.indexOf(",");
  if (commaIndex >= 0) {
    return {
      last: normalized.slice(0, commaIndex).trim(),
      first: normalized.slice(commaIndex + 1).trim(),
      full: normalized,
    };
  }

  const parts = normalized.split(" ");
  return {
    last: parts.at(-1) || "",
    first: parts.slice(0, -1).join(" "),
    full: normalized,
  };
}

export function compareStudentNamesByLastName(
  leftName: string | null | undefined,
  rightName: string | null | undefined,
  leftFallback = "",
  rightFallback = "",
) {
  const left = studentNameParts(leftName, leftFallback);
  const right = studentNameParts(rightName, rightFallback);

  return nameCollator.compare(left.last, right.last)
    || nameCollator.compare(left.first, right.first)
    || nameCollator.compare(left.full, right.full);
}

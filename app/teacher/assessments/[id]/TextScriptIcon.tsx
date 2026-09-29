type TextScriptIconProps = {
  kind: "subscript" | "superscript";
};

export default function TextScriptIcon({ kind }: TextScriptIconProps) {
  const numberPath = kind === "superscript"
    ? "M16 4.5c0-1.5 4-1.7 4-.05 0 1.4-4 2.65-4 4.55h4"
    : "M16 15.5c0-1.5 4-1.7 4-.05 0 1.4-4 2.65-4 4.55h4";

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M3.5 6l9 12M12.5 6l-9 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d={numberPath}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

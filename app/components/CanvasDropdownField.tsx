"use client";

import { useLayoutEffect, useRef, useState } from "react";

type CanvasDropdownFieldProps = {
  ariaLabel: string;
  canvas?: boolean;
  options: string[];
  value?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

export default function CanvasDropdownField({ ariaLabel, options, value = "", disabled = false, canvas = true, onChange }: CanvasDropdownFieldProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [widthEm, setWidthEm] = useState<number>();
  useLayoutEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    context.font = `500 100px ${getComputedStyle(node).fontFamily}`;
    setWidthEm(Math.max(4, ...options.map(option => context.measureText(option).width / 100 + 3.5)));
  }, [options]);
  return (
    <div ref={wrapperRef} className="relative h-full w-max" style={{ fontSize: canvas ? "1.5cqw" : "1rem", display: "inline-grid", minWidth: "4em", width: widthEm ? `${widthEm}em` : undefined }}>
      {(options.length ? options : [""]).map((option, index) => <span key={index} aria-hidden="true" style={{ gridArea: "1 / 1", minWidth: 0, overflow: "hidden", visibility: "hidden", whiteSpace: "pre", paddingLeft: "0.65em", paddingRight: "2.5em", border: "0.13em solid transparent", fontWeight: 500 }}>{option}</span>)}
      <select
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", minWidth: 0, fontSize: "inherit", borderWidth: "0.13em", borderRadius: "0.5em" }}
        className="h-full appearance-none rounded-lg border-2 border-[#d8d8d8] bg-white/50 pl-[0.65em] pr-[2.5em] font-medium text-slate-950 outline-none transition focus:border-[#2f73dc] focus:ring-2 focus:ring-blue-200 disabled:cursor-default disabled:opacity-100"
      >
        <option value="" aria-label="No answer selected" />
        {options.map((option, optionIndex) => (
          <option key={`${option}-${optionIndex}`} value={option}>{option}</option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 16"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute right-[0.65em] top-1/2 h-[0.8em] w-[1.2em] -translate-y-1/2 text-[#2f73dc]"
      >
        <path d="M3 3.5 12 12l9-8.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

"use client";

type CanvasDropdownFieldProps = {
  ariaLabel: string;
  options: string[];
  value?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

export default function CanvasDropdownField({ ariaLabel, options, value = "", disabled = false, onChange }: CanvasDropdownFieldProps) {
  return (
    <div className="relative h-full w-full">
      <select
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-full w-full appearance-none rounded-lg border-2 border-[#d8d8d8] bg-white/50 pl-[8%] pr-[28%] text-[clamp(0.875rem,1.5cqw,1.375rem)] font-medium text-slate-950 outline-none transition focus:border-[#2f73dc] focus:ring-2 focus:ring-blue-200 disabled:cursor-default disabled:opacity-100"
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
        className="pointer-events-none absolute right-[8%] top-1/2 h-[34%] w-auto -translate-y-1/2 text-[#2f73dc]"
      >
        <path d="M3 3.5 12 12l9-8.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

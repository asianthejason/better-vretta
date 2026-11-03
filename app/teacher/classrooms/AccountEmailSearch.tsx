"use client";

import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AccountRole = "teacher" | "student";
type AccountMatch = { id: string; email: string; full_name: string };

export default function AccountEmailSearch({
  role,
  value,
  onChange,
  onSubmit,
  disabledAccountIds = new Set<string>(),
}: {
  role: AccountRole;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabledAccountIds?: ReadonlySet<string>;
}) {
  const listId = useId();
  const requestId = useRef(0);
  const [matches, setMatches] = useState<AccountMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = value.trim();

  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (query.length < 3) return;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_accounts", {
        search_text: query,
        account_role: role,
      });
      if (currentRequest !== requestId.current) return;
      setMatches(error ? [] : (data as AccountMatch[]) || []);
      setLoading(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, role]);

  function choose(account: AccountMatch) {
    if (disabledAccountIds.has(account.id)) return;
    onChange(account.email);
    setOpen(false);
  }

  function nextEnabledIndex(start: number, direction: 1 | -1) {
    let index = start;
    while (index >= 0 && index < matches.length) {
      if (!disabledAccountIds.has(matches[index].id)) return index;
      index += direction;
    }
    return -1;
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          setActiveIndex(-1);
          setLoading(nextValue.trim().length >= 3);
          if (nextValue.trim().length < 3) setMatches([]);
          setOpen(true);
        }}
        onFocus={() => query.length >= 3 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && open && matches.length) {
            event.preventDefault();
            setActiveIndex((current) => nextEnabledIndex(current + 1, 1));
          } else if (event.key === "ArrowUp" && open && matches.length) {
            event.preventDefault();
            setActiveIndex((current) => nextEnabledIndex(current < 0 ? matches.length - 1 : current - 1, -1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (open && activeIndex >= 0) choose(matches[activeIndex]);
            else onSubmit();
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        type="email"
        placeholder={`${role === "teacher" ? "Teacher" : "Student"} email address`}
        aria-label={`${role === "teacher" ? "Teacher" : "Student"} email address`}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && query.length >= 3}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        role="combobox"
        autoComplete="off"
        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
      {open && query.length >= 3 && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {loading ? (
            <p className="px-3 py-2.5 text-sm text-slate-500">Searching accounts…</p>
          ) : matches.length ? (
            matches.map((account, index) => {
              const alreadyAdded = disabledAccountIds.has(account.id);
              return (
              <button
                id={`${listId}-${index}`}
                key={account.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={alreadyAdded}
                disabled={alreadyAdded}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(account)}
                onMouseEnter={() => !alreadyAdded && setActiveIndex(index)}
                className={`w-full rounded-lg px-3 py-2 text-left ${alreadyAdded ? "cursor-not-allowed bg-slate-50 text-slate-500" : index === activeIndex ? "bg-blue-50" : "hover:bg-slate-50"}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className={`truncate text-sm font-bold ${alreadyAdded ? "text-slate-600" : "text-slate-900"}`}>
                    {account.full_name.trim() || account.email}
                  </span>
                  {alreadyAdded && <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Already added</span>}
                </span>
                {account.full_name.trim() && (
                  <span className="block truncate text-xs text-slate-600">{account.email}</span>
                )}
              </button>
              );
            })
          ) : (
            <p className="px-3 py-2.5 text-sm leading-5 text-slate-600">
              No existing {role} account found. You can still add this email; it will join automatically after signup.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

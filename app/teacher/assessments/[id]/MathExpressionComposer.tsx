"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildMathExpressionHtml,
  canRemoveMathNode,
  createMathNodeId,
  createMathSlot,
  createMathText,
  findMathNode,
  findMathParent,
  insertMathSibling,
  mathExpressionHasEmptySlots,
  removeMathNode,
  replaceMathNode,
  type MathBracketStyle,
  type MathExpressionNode,
} from "@/lib/mathExpressionTree";

type Props = {
  value: MathExpressionNode;
  onChange: (value: MathExpressionNode) => void;
  onCommit: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  editingExisting?: boolean;
  compact?: boolean;
};

const button = "h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:border-blue-400 hover:bg-blue-50";

function NodeView({ node, selectedId, onSelect }: { node: MathExpressionNode; selectedId: string; onSelect: (id: string) => void }) {
  const selected = node.id === selectedId;
  const shell = (contents: ReactNode, extra = "") => <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelect(node.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(node.id); } }} className={`relative inline-flex min-h-8 items-center justify-center rounded px-1 align-middle ${selected ? "bg-blue-100 ring-2 ring-blue-500" : "hover:bg-blue-50"} ${extra}`}>{contents}</span>;
  const child = (value: MathExpressionNode) => <NodeView node={value} selectedId={selectedId} onSelect={onSelect} />;
  switch (node.type) {
    case "slot": return shell(<span className="rounded border border-dashed border-blue-400 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{node.label || "Add"}</span>);
    case "text": return shell(<span className="whitespace-pre-wrap font-serif text-xl">{node.value || "□"}</span>);
    case "sequence": return shell(<span className="inline-flex items-center gap-0.5">{node.children.map((item) => <NodeView key={item.id} node={item} selectedId={selectedId} onSelect={onSelect} />)}</span>);
    case "fraction": return shell(<span className="inline-flex min-w-12 flex-col items-stretch text-center"><span className="border-b border-slate-950 px-1">{child(node.numerator)}</span><span className="px-1">{child(node.denominator)}</span></span>);
    case "root": {
      const squareRoot = node.index.type === "text" && ["", "2"].includes(node.index.value.trim());
      return shell(<span className="relative inline-flex min-h-12 items-stretch pl-1">
        {!squareRoot && <span role="button" tabIndex={0} aria-label="Root index" className="absolute -left-0.5 top-0 z-10 font-serif text-xs leading-none" onClick={(event) => { event.stopPropagation(); onSelect(node.index.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(node.index.id); } }}>{node.index.type === "text" ? node.index.value : child(node.index)}</span>}
        <span className="w-7 self-stretch" aria-hidden="true"><svg viewBox="0 0 32 100" preserveAspectRatio="none" className="h-full w-full overflow-visible"><path d="M1 59 Q5 54 8.5 58 L13.5 84 L23.5 6 Q24 1 28.5 1 H32" fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span className="-ml-px flex items-center border-t-2 border-slate-950 px-1 pt-0.5">{child(node.radicand)}</span>
      </span>);
    }
    case "brackets": {
      const [open, close] = node.style === "brackets" ? ["[", "]"] : node.style === "braces" ? ["{", "}"] : ["(", ")"];
      return shell(<span className="inline-flex items-stretch"><span className="flex items-center font-serif text-4xl font-light">{open}</span>{child(node.body)}<span className="flex items-center font-serif text-4xl font-light">{close}</span></span>);
    }
    case "superscript": return shell(<span className="inline-flex items-start">{child(node.base)}<sup className="-ml-0.5">{child(node.exponent)}</sup></span>);
    case "subscript": return shell(<span className="inline-flex items-end">{child(node.base)}<sub className="-ml-0.5">{child(node.subscript)}</sub></span>);
    case "summation": case "product": return shell(<span className="inline-flex items-center"><span className="inline-flex flex-col items-center"><span className="text-xs">{child(node.upper)}</span><span className="font-serif text-4xl leading-7">{node.type === "summation" ? "∑" : "∏"}</span><span className="text-xs">{child(node.lower)}</span></span>{child(node.body)}</span>);
    case "integral": return shell(<span className="inline-flex items-center"><span className="inline-flex flex-col items-center"><span className="text-xs">{child(node.upper)}</span><span className="font-serif text-4xl leading-7">∫</span><span className="text-xs">{child(node.lower)}</span></span>{child(node.body)}<span className="font-serif">d</span>{child(node.variable)}</span>);
    case "limit": return shell(<span className="inline-flex items-end"><span className="inline-flex flex-col items-center"><span className="font-serif text-lg">lim</span><span className="text-xs">{child(node.variable)} → {child(node.approach)}</span></span>{child(node.body)}</span>);
  }
}

function makeTemplate(kind: string, selected: MathExpressionNode): { node: MathExpressionNode; nextId: string } {
  const id = createMathNodeId();
  if (kind === "text") { const node = createMathText(""); return { node, nextId: node.id }; }
  if (kind === "fraction") {
    const numerator = selected.type === "slot" ? createMathSlot("numerator") : selected;
    const denominator = createMathSlot("denominator");
    return { node: { type: "fraction", id, numerator, denominator }, nextId: selected.type === "slot" ? numerator.id : denominator.id };
  }
  if (kind === "root") {
    const radicand = selected.type === "slot" ? createMathSlot("radicand") : selected;
    return { node: { type: "root", id, index: createMathText("2"), radicand }, nextId: radicand.id };
  }
  if (kind === "superscript") {
    const base = selected.type === "slot" ? createMathSlot("base") : selected;
    const exponent = createMathSlot("exponent");
    return { node: { type: "superscript", id, base, exponent }, nextId: selected.type === "slot" ? base.id : exponent.id };
  }
  if (kind === "subscript") {
    const base = selected.type === "slot" ? createMathSlot("base") : selected;
    const subscript = createMathSlot("subscript");
    return { node: { type: "subscript", id, base, subscript }, nextId: selected.type === "slot" ? base.id : subscript.id };
  }
  if (kind === "summation" || kind === "product") {
    const body = selected.type === "slot" ? createMathSlot("expression") : selected;
    return { node: { type: kind, id, lower: createMathText("i = 1"), upper: createMathText("n"), body }, nextId: body.id };
  }
  if (kind === "integral") {
    const body = selected.type === "slot" ? createMathSlot("integrand") : selected;
    return { node: { type: "integral", id, lower: createMathText("a"), upper: createMathText("b"), body, variable: createMathText("x") }, nextId: body.id };
  }
  const body = selected.type === "slot" ? createMathSlot("expression") : selected;
  return { node: { type: "limit", id, variable: createMathText("x"), approach: createMathText("0"), body }, nextId: body.id };
}

export default function MathExpressionComposer({ value, onChange, onCommit, onCancel, onDelete, editingExisting = false, compact = false }: Props) {
  const [selectedId, setSelectedId] = useState(value.id);
  const [showBasicSymbols, setShowBasicSymbols] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => findMathNode(value, selectedId) || value, [value, selectedId]);

  const focusTextInput = () => requestAnimationFrame(() => {
    if (textInputRef.current && !textInputRef.current.disabled) {
      textInputRef.current.focus();
      textInputRef.current.select();
    }
  });
  const selectNode = (id: string) => { setSelectedId(id); focusTextInput(); };
  useEffect(() => {
    if (selected.type !== "slot" && selected.type !== "text") return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement !== textInputRef.current) {
        textInputRef.current?.focus();
        textInputRef.current?.select();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selected.id, selected.type]);

  const replaceSelected = (node: MathExpressionNode, nextId = node.id) => { onChange(replaceMathNode(value, selected.id, node)); setSelectedId(nextId); };
  const addTemplate = (kind: string) => { const result = makeTemplate(kind, selected); replaceSelected(result.node, result.nextId); };
  const wrapBrackets = (style: MathBracketStyle) => {
    const body = selected.type === "slot" ? createMathSlot("inside brackets") : selected;
    replaceSelected({ type: "brackets", id: createMathNodeId(), style, body }, body.id);
  };
  const addSibling = (side: "before" | "after") => { const result = insertMathSibling(value, selected.id, side); onChange(result.root); setSelectedId(result.selectedId); };
  const removeSelected = () => { const result = removeMathNode(value, selected.id); onChange(result.root); setSelectedId(result.selectedId); };
  const addBasicSymbol = (symbol: string) => {
    if (selected.type === "slot") {
      const symbolNode = createMathText(symbol);
      replaceSelected(symbolNode);
      return;
    }
    if (selected.type === "text") {
      replaceSelected({ ...selected, value: `${selected.value}${symbol}` }, selected.id);
      return;
    }
    const insertion = insertMathSibling(value, selected.id, "after");
    const symbolNode = createMathText(symbol);
    onChange(replaceMathNode(insertion.root, insertion.selectedId, symbolNode));
    setSelectedId(symbolNode.id);
  };
  const parent = findMathParent(value, selected.id);
  const selectedRoot = selected.type === "root" ? selected : parent?.type === "root" ? parent : null;
  const selectedCanBeRemoved = canRemoveMathNode(value, selected.id);
  const textValue = selected.type === "text" ? selected.value : "";

  const nodeLabel = (node: MathExpressionNode) => {
    if (node.type === "slot") return node.label || "Empty slot";
    if (node.type === "text") return node.value || "Text";
    if (node.type === "sequence") return "Expression";
    if (node.type === "fraction") return "Fraction";
    if (node.type === "root") return node.index.type === "text" && ["", "2"].includes(node.index.value.trim()) ? "Square root" : "Root";
    if (node.type === "brackets") return "Bracketed expression";
    if (node.type === "superscript") return "Exponent";
    if (node.type === "subscript") return "Subscript";
    return node.type.charAt(0).toUpperCase() + node.type.slice(1);
  };

  return <div className={`rounded-xl border border-blue-200 bg-blue-50 text-left shadow-lg ${compact ? "p-2" : "p-3"}`} onMouseDown={(event) => event.stopPropagation()}>
    <p className="mb-2 text-xs text-blue-900">Select a highlighted slot or any part of the expression, then add, wrap, or edit it. Every math structure can contain another structure.</p>
    <div className="mb-2 flex flex-wrap gap-1.5">
      {[['text', 'Text'], ['fraction', 'a⁄b'], ['root', '√'], ['superscript', 'x²'], ['subscript', 'x₂'], ['summation', '∑'], ['product', '∏'], ['integral', '∫'], ['limit', 'lim']].map(([kind, label]) => <button key={kind} type="button" className={button} onClick={() => addTemplate(kind)} title={`Put ${label} in the selected slot or wrap the selected expression`}>{label}</button>)}
      <button type="button" className={showBasicSymbols ? "h-9 rounded-lg border border-blue-500 bg-blue-600 px-3 text-xs font-semibold text-white hover:border-blue-400 hover:bg-blue-500" : button} aria-expanded={showBasicSymbols} onClick={() => setShowBasicSymbols((current) => !current)} title="Basic math symbols">π Symbols</button>
      <select aria-label="Add brackets" defaultValue="" onChange={(event) => { if (event.target.value) wrapBrackets(event.target.value as MathBracketStyle); event.currentTarget.value = ""; }} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800">
        <option value="" disabled>Brackets</option><option value="parentheses">( ) Parentheses</option><option value="brackets">[ ] Square</option><option value="braces">{'{ }'} Braces</option>
      </select>
    </div>
    {showBasicSymbols && <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-blue-200 bg-white p-2">
      {["π", "θ", "Δ", "∞", "±", "×", "÷", "≠", "≈", "≤", "≥", "°", "→", "←", "∈", "∉", "∠", "⊥", "∥", "%"].map((symbol) => <button key={symbol} type="button" title={`Insert ${symbol}`} onClick={() => addBasicSymbol(symbol)} className="grid h-9 min-w-9 place-items-center rounded-md border border-slate-300 bg-white px-2 text-base font-semibold text-slate-900 hover:border-blue-400 hover:bg-blue-100">{symbol}</button>)}
    </div>}
    <div className="mb-2 min-h-24 overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-center text-slate-950" onClick={() => selectNode(value.id)}>
      <NodeView node={value} selectedId={selected.id} onSelect={selectNode} />
    </div>
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2">
      <label className="min-w-48 flex-1 text-xs font-semibold text-slate-600">Selected content: {nodeLabel(selected)}
        <input ref={textInputRef} value={textValue} disabled={selected.type !== "slot" && selected.type !== "text"} placeholder={selected.type === "slot" ? selected.label || "Enter text" : "Select a text value or empty slot"} onChange={(event) => { replaceSelected({ type: "text", id: selected.id, value: event.target.value }); }} className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 disabled:bg-slate-100" />
      </label>
      {selectedRoot && <label className="text-xs font-semibold text-slate-600">Root index<input value={selectedRoot.index.type === "text" ? selectedRoot.index.value : ""} placeholder="2" inputMode="numeric" onFocus={(event) => event.currentTarget.select()} onChange={(event) => onChange(replaceMathNode(value, selectedRoot.id, { ...selectedRoot, index: createMathText(event.target.value) }))} onBlur={(event) => { if (!event.currentTarget.value) onChange(replaceMathNode(value, selectedRoot.id, { ...selectedRoot, index: createMathText("2") })); }} className="mt-1 block h-9 w-20 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950" /></label>}
      {selected.type === "brackets" && <label className="text-xs font-semibold text-slate-600">Bracket style<select value={selected.style} onChange={(event) => replaceSelected({ ...selected, style: event.target.value as MathBracketStyle })} className="mt-1 block h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950"><option value="parentheses">( )</option><option value="brackets">[ ]</option><option value="braces">{'{ }'}</option></select></label>}
      <button type="button" className={button} onClick={() => addSibling("before")}>+ Before</button>
      <button type="button" className={button} onClick={() => addSibling("after")}>+ After</button>
      <button type="button" disabled={!parent} className={`${button} disabled:opacity-40`} onClick={() => parent && setSelectedId(parent.id)}>Select parent</button>
      <button type="button" disabled={!selectedCanBeRemoved} title={selectedCanBeRemoved ? "Remove the selected block from this expression" : "This slot is already empty; select a block to remove"} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" onClick={removeSelected}>Remove selected block</button>
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-h-12 min-w-28 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xl text-slate-950" aria-label="Math notation preview" dangerouslySetInnerHTML={{ __html: buildMathExpressionHtml(value) }} />
      <div className="flex flex-wrap gap-2">{editingExisting && onDelete && <button type="button" onClick={onDelete} className="h-9 rounded-lg border border-red-300 bg-white px-4 text-xs font-semibold text-red-700 hover:bg-red-50">Remove expression</button>}{onCancel && <button type="button" onClick={onCancel} className={button}>Cancel</button>}<button type="button" onClick={onCommit} disabled={mathExpressionHasEmptySlots(value)} title={mathExpressionHasEmptySlots(value) ? "Fill every highlighted math slot first." : undefined} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">{editingExisting ? "Update notation" : "Insert notation"}</button></div>
    </div>
  </div>;
}

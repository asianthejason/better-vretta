"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { getCanvasTextHtml, type DragDropCanvasElement } from "@/lib/dragDrop";

export default function CanvasInlineTextEditor({ element, toolbarPlacement = "above", onChange, onMovePointerDown, onDone, onDelete }: {
  element: DragDropCanvasElement;
  toolbarPlacement?: "above" | "below";
  onChange: (patch: Partial<DragDropCanvasElement>) => void;
  onMovePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const html = getCanvasTextHtml(element);
    if (editor && document.activeElement !== editor && editor.innerHTML !== html) editor.innerHTML = html;
  }, [element]);

  function getSafeContent() {
    const editor = editorRef.current;
    if (!editor) return { textHtml: "", text: "" };
    const copy = editor.cloneNode(true) as HTMLDivElement;
    const allowedTags = new Set(["DIV", "P", "BR", "B", "STRONG", "I", "EM", "U"]);
    Array.from(copy.querySelectorAll("*")).forEach((child) => {
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      const textAlign = child instanceof HTMLElement ? child.style.textAlign : "";
      Array.from(child.attributes).forEach((attribute) => child.removeAttribute(attribute.name));
      if (child instanceof HTMLElement && ["left", "center", "right"].includes(textAlign)) child.style.textAlign = textAlign;
    });
    return { textHtml: copy.innerHTML, text: editor.innerText };
  }

  function emitChange() {
    onChange({ ...getSafeContent(), textAlign: undefined, bold: undefined, italic: undefined, underline: undefined });
  }

  function runCommand(command: string) {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emitChange();
  }

  const toolbarButton = "grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-blue-50";

  return <>
    <div data-canvas-object className={`absolute left-0 z-50 flex w-max max-w-[min(32rem,90vw)] flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1.5 shadow-lg ${toolbarPlacement === "below" ? "top-full mt-1" : "bottom-full mb-1"}`} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onPointerDown={onMovePointerDown} className={`${toolbarButton} cursor-move touch-none text-blue-800`}>Move</button>
      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">Size<input type="number" min="10" max="72" value={element.fontSize || 18} onChange={(event) => onChange({ fontSize: Math.max(10, Math.min(72, Number(event.target.value) || 18)) })} className="h-7 w-14 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} className={`${toolbarButton} font-bold`} aria-label="Bold selected text">B</button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} className={`${toolbarButton} italic`} aria-label="Italicize selected text">I</button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")} className={`${toolbarButton} underline`} aria-label="Underline selected text">U</button>
      {(["Left", "Center", "Right"] as const).map((alignment) => <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(`justify${alignment}`)} className={toolbarButton} aria-label={`Align selected paragraph ${alignment.toLowerCase()}`}>{alignment[0]}</button>)}
      <button type="button" onClick={onDone} className={`${toolbarButton} text-blue-800`}>Done</button>
      <button type="button" onClick={onDelete} className={`${toolbarButton} border-red-300 text-red-700`}>Delete</button>
    </div>
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Canvas text"
      aria-multiline="true"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onInput={emitChange}
      onPaste={(event) => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        emitChange();
      }}
      className="rich-text-content h-full w-full cursor-text overflow-auto text-slate-950 outline-none"
      style={{ fontSize: `${(element.fontSize || 18) / 10}cqw`, padding: "0.8cqw" }}
    />
  </>;
}

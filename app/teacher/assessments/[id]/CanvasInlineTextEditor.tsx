"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { getCanvasTextHtml, type DragDropCanvasElement } from "@/lib/dragDrop";

export default function CanvasInlineTextEditor({ element, selected, editing, toolbarPlacement = "above", onChange, onMovePointerDown, onStartEditing, onDelete }: {
  element: DragDropCanvasElement;
  selected: boolean;
  editing: boolean;
  toolbarPlacement?: "above" | "below";
  onChange: (patch: Partial<DragDropCanvasElement>) => void;
  onMovePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onStartEditing: () => void;
  onDelete: () => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const focusedOnOpenRef = useRef(false);
  const requestedCaretPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const html = getCanvasTextHtml(element);
    if (!editor) return;
    if (document.activeElement !== editor && editor.innerHTML !== html) editor.innerHTML = html;
    if (editing && !focusedOnOpenRef.current) {
      editor.focus();
      focusedOnOpenRef.current = true;
      const caretPoint = requestedCaretPointRef.current;
      requestedCaretPointRef.current = null;
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || !editor.isConnected) return;
        const caretDocument = document as Document & {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        let range: Range | null = null;
        if (caretPoint) {
          const position = caretDocument.caretPositionFromPoint?.(caretPoint.x, caretPoint.y);
          if (position && editor.contains(position.offsetNode)) {
            range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
          } else {
            const legacyRange = caretDocument.caretRangeFromPoint?.(caretPoint.x, caretPoint.y);
            if (legacyRange && editor.contains(legacyRange.startContainer)) range = legacyRange;
          }
        }
        if (!range) {
          range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      });
    }
    if (!editing) focusedOnOpenRef.current = false;
  }, [editing, element]);

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
    if (!editing) return;
    editorRef.current?.focus();
    document.execCommand(command, false);
    emitChange();
  }

  const toolbarButton = "grid h-7 min-w-7 place-items-center rounded border border-slate-300 bg-white px-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-blue-50";

  return <>
    {selected && <div data-canvas-object className={`absolute left-0 z-50 flex w-max max-w-[calc(100cqw-1rem)] flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1.5 shadow-lg ${toolbarPlacement === "below" ? "top-full mt-1" : "bottom-full mb-1"}`} style={{ transform: `translateX(clamp(-${element.x}cqw, 0px, calc(${100 - element.x}cqw - 100%)))` }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">Size<input type="number" min="10" max="72" value={element.fontSize || 18} onChange={(event) => onChange({ fontSize: Math.max(10, Math.min(72, Number(event.target.value) || 18)) })} className="h-7 w-14 rounded border border-slate-300 bg-white px-1.5 text-slate-950" /></label>
      {editing ? <>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} className={`${toolbarButton} font-bold`} aria-label="Bold selected text">B</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} className={`${toolbarButton} italic`} aria-label="Italicize selected text">I</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")} className={`${toolbarButton} underline`} aria-label="Underline selected text">U</button>
        {(["Left", "Center", "Right"] as const).map((alignment) => <button key={alignment} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(`justify${alignment}`)} className={toolbarButton} aria-label={`Align selected paragraph ${alignment.toLowerCase()}`} title={`Align ${alignment.toLowerCase()}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">{alignment === "Left" ? <path d="M3 4h14M3 8h9M3 12h14M3 16h9" /> : alignment === "Center" ? <path d="M3 4h14M5.5 8h9M3 12h14M5.5 16h9" /> : <path d="M3 4h14M8 8h9M3 12h14M8 16h9" />}</svg></button>)}
      </> : null}
      <button type="button" onClick={onDelete} className={`${toolbarButton} border-red-300 text-red-700`}>Delete</button>
    </div>}
    <div
      ref={editorRef}
      contentEditable={editing}
      suppressContentEditableWarning
      role="textbox"
      aria-label="Canvas text"
      aria-multiline="true"
      onPointerDown={(event) => { if (editing) event.stopPropagation(); else onMovePointerDown(event); }}
      onClick={(event) => { if (editing) event.stopPropagation(); }}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); requestedCaretPointRef.current = { x: event.clientX, y: event.clientY }; onStartEditing(); }}
      onInput={emitChange}
      onPaste={(event) => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        emitChange();
      }}
      className={`rich-text-content h-full w-full overflow-auto text-slate-950 outline-none ${editing ? "cursor-text bg-white/80 ring-2 ring-inset ring-blue-400" : "cursor-move"}`}
      style={{ fontSize: `${(element.fontSize || 18) / 10}cqw`, padding: "0.8cqw" }}
    />
  </>;
}

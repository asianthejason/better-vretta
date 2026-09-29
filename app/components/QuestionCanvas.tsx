"use client";

import type { ReactNode } from "react";
import LocationCanvasElementContent from "@/app/components/LocationCanvasElementContent";
import { getChoiceContentSizes, normalizeCanvasHeight } from "@/lib/dragDrop";
import { normalizeQuestionCanvas, type QuestionCanvasData } from "@/lib/questionCanvas";

export default function QuestionCanvas({ canvas: savedCanvas, interaction, legacyPrompt, choices, overlays, className = "" }: {
  canvas: QuestionCanvasData;
  interaction?: ReactNode;
  legacyPrompt?: ReactNode;
  choices?: Array<{ text: string; html?: string; imageUrl?: string }>;
  overlays?: ReactNode;
  className?: string;
}) {
  const canvas = normalizeQuestionCanvas(savedCanvas);
  const canvasHeight = normalizeCanvasHeight(canvas.canvasHeight);
  const choiceLayout = canvas.choiceLayout || { grouped: true, direction: "vertical" as const, presentation: "content" as const, x: 8, y: 35, positions: [] };
  const contentSizes = getChoiceContentSizes((choices || []).map((choice, index) => ({ id: String(index), content: choice.text, html: choice.html, imageUrl: choice.imageUrl, ...choiceLayout.positions[index] })), { sameSize: choiceLayout.sameSize, canvasHeight });
  const contentStyle = (index: number) => ({ width: `${contentSizes[index].width}cqw`, height: `${contentSizes[index].height}cqw` });
  const choiceNode = (choice: NonNullable<typeof choices>[number], index: number, fillsWrapper = false) => <div key={index} aria-label={choice.text || `Choice ${index + 1}`} style={fillsWrapper ? { width: "100%", height: "100%" } : choiceLayout.presentation === "content" ? { padding: "1cqw 1.2cqw", fontSize: "1.7cqw", ...contentStyle(index) } : choiceLayout.presentation === "radio" ? { width: "3.2cqw", height: "3.2cqw" } : { width: `${choiceLayout.positions[index]?.width ?? 6}cqw`, height: `${(choiceLayout.positions[index]?.height ?? 10.5) * 9 / 16}cqw` }} className={`box-border flex shrink-0 flex-col ${choiceLayout.presentation === "content" ? "items-start text-left" : "items-center text-center"} whitespace-nowrap ${choiceLayout.positions[index]?.textVerticalAlign === "top" ? "justify-start" : choiceLayout.positions[index]?.textVerticalAlign === "bottom" ? "justify-end" : "justify-center"} border border-slate-400 bg-white/50 font-medium text-black shadow-sm ${choiceLayout.presentation === "radio" ? "rounded-full border-2" : "rounded"}`}>{choiceLayout.presentation === "content" && <>{choice.imageUrl && <img src={choice.imageUrl} alt="" style={{ maxHeight: "10cqw", maxWidth: "14cqw", marginBottom: "0.5cqw" }} className="min-h-0 flex-1 object-contain" />}<span className="w-full">{choice.html ? <span className="rich-text-content inline" dangerouslySetInnerHTML={{ __html: choice.html }} /> : choice.text}</span></>}</div>;
  return (
    <div style={{ containerType: "inline-size", aspectRatio: `100 / ${canvasHeight}` }} className={`relative isolate w-full overflow-hidden border border-slate-300 bg-white text-slate-950 ${className}`}>
      {canvas.backgroundImageUrl && <img src={canvas.backgroundImageUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />}
      {canvas.elements.map((element) => (
        <div key={element.id} className="pointer-events-none absolute" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}>
          <LocationCanvasElementContent element={element} />
        </div>
      ))}
      {choices && (choiceLayout.grouped ? <div className={`absolute z-20 flex w-max ${choiceLayout.direction === "vertical" ? "flex-col" : "flex-row"}`} style={{ left: `${choiceLayout.x}%`, top: `${choiceLayout.y}%`, gap: "0.8cqw" }}>{choices.map((choice, index) => choiceNode(choice, index))}</div> : <>{choices.map((choice, index) => <div key={index} className="absolute z-20" style={{ left: `${choiceLayout.positions[index]?.x ?? 8}%`, top: `${choiceLayout.positions[index]?.y ?? 35 + index * 12}%`, ...(choiceLayout.presentation === "box" ? { width: `${choiceLayout.positions[index]?.width ?? 6}%`, height: `${choiceLayout.positions[index]?.height ?? 10.5}%` } : {}) }}>{choiceNode(choice, index, choiceLayout.presentation === "box")}</div>)}</>)}
      {overlays}
      {canvas.legacyPrompt && legacyPrompt && <div className="absolute overflow-auto" style={{ left: `${canvas.legacyPrompt.x}%`, top: `${canvas.legacyPrompt.y}%`, width: `${canvas.legacyPrompt.width}%`, height: `${canvas.legacyPrompt.height}%` }}>{legacyPrompt}</div>}
      {canvas.interaction && interaction && <div className="absolute overflow-auto" style={{ left: `${canvas.interaction.x}%`, top: `${canvas.interaction.y}%`, width: `${canvas.interaction.width}%`, height: `${canvas.interaction.height}%` }}>{interaction}</div>}
    </div>
  );
}

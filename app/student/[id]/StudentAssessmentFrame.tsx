"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import styles from "./StudentAssessmentFrame.module.css";

type Props = {
  title: string;
  questionTextSize?: number;
  questions: Array<{ id: string; answered: boolean }>;
  activeIndex: number;
  onNavigate: (index: number) => void;
  split: boolean;
  panelView: "left" | "split" | "right";
  onPanelViewChange: (view: "left" | "split" | "right") => void;
  hasFormulaSheet: boolean;
  resourcesOpen: boolean;
  onToggleResources: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitDisabledReason: string;
  accountControls?: ReactNode;
  children: ReactNode;
};

function FormulaSheetIcon() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M32 5H8a3 3 0 0 0-3 3v29h4M29 5v5H9a2 2 0 0 1 0-4M38 13H15a3 3 0 0 0-3 3v27h4M35 13v5H16a2 2 0 0 1 0-4M20 22h23v24H20zM25 28h13M25 33h13M25 38h9" /></svg>;
}

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export default function StudentAssessmentFrame({ title, questionTextSize, questions, activeIndex, onNavigate, split, panelView, onPanelViewChange, hasFormulaSheet, resourcesOpen, onToggleResources, onSubmit, canSubmit, submitDisabledReason, accountControls, children }: Props) {
  const [collapsedOverride, setCollapsed] = useState<boolean | null>(null);
  const narrowScreen = useSyncExternalStore(subscribeToViewport, () => window.matchMedia("(max-width: 760px)").matches, () => false);
  const collapsed = collapsedOverride ?? narrowScreen;
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set());
  const currentId = questions[activeIndex]?.id;
  const currentFlagged = Boolean(currentId && flagged.has(currentId));
  const toggleFlag = () => {
    if (!currentId) return;
    setFlagged((previous) => { const next = new Set(previous); if (next.has(currentId)) next.delete(currentId); else next.add(currentId); return next; });
  };
  return <div className={`${styles.frame} ${collapsed ? styles.collapsed : ""}`}>
    <aside className={styles.sidebar} aria-label="Assessment navigation">
      <div className={styles.sidebarTop}><button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand question navigation" : "Collapse question navigation"} aria-expanded={!collapsed} aria-controls="assessment-navigation" className={styles.collapseButton}>{collapsed ? "»" : "«"}</button></div>
      <div className={styles.navigationFilter}><label className="sr-only" htmlFor="assessment-navigation-filter">Navigate the assessment</label><select id="assessment-navigation-filter" defaultValue="questions"><option value="questions">Questions</option></select></div>
      <h2 className={styles.questionsHeading}>Questions</h2>
      <nav id="assessment-navigation" className={styles.questionList} aria-label="Assessment questions">
        {questions.map((question, index) => {
          return <button key={question.id} type="button" onClick={() => onNavigate(index)} aria-current={index === activeIndex ? "step" : undefined} aria-label={`Question ${index + 1}${question.answered ? ", answered" : ""}${flagged.has(question.id) ? ", flagged" : ""}`} className={`${styles.questionLink} ${index === activeIndex ? styles.activeQuestion : ""}`} title={`Question ${index + 1}`}>
            <span className={`${styles.answerIndicator} ${question.answered ? styles.answered : ""}`} aria-hidden="true">{question.answered ? "✓" : ""}</span><span className={styles.questionLabel}>Question {index + 1}</span>{flagged.has(question.id) && <span className={styles.flagIndicator} aria-hidden="true">⚑</span>}
          </button>;
        })}
      </nav>
      <div className={styles.account}><p title={title} className={styles.assessmentTitle}>{title}</p>{accountControls}</div>
    </aside>

    <div className={styles.stage}>
      <article className={`${styles.paper} ${split ? styles.splitPaper : ""} ${split && panelView === "split" ? styles.sideBySide : ""} ${split && panelView === "left" ? styles.leftOnly : ""}`} aria-label={`Question ${activeIndex + 1}`}>
        <header className={styles.questionHeader}>
          <h1>Question {activeIndex + 1}</h1>
          <button type="button" onClick={toggleFlag} aria-pressed={currentFlagged} className={styles.flagButton} style={questionTextSize ? { fontSize: `${questionTextSize / 10}cqw` } : undefined}><span aria-hidden="true">⚑</span>{currentFlagged ? "Unflag this question" : "Flag this question"}</button>
        </header>
        <div className={styles.questionContent}>{children}</div>
      </article>
    </div>

    <aside className={styles.tools} aria-label="Assessment tools">
      <button type="button" onClick={onToggleResources} disabled={!hasFormulaSheet} aria-label="Formula sheet" aria-pressed={resourcesOpen} aria-controls="student-question-content" title={hasFormulaSheet ? "Formula Sheet" : "No formula sheet available"} className={`${styles.resourceButton} ${resourcesOpen ? styles.resourceActive : ""}`}><FormulaSheetIcon /><span className={styles.resourceTooltip}>{hasFormulaSheet ? "Formula Sheet" : "No formula sheet available"}</span></button>
    </aside>
    {split && <div className={styles.viewControls} role="group" aria-label="Panel view">
      {(["left", "split", "right"] as const).map((view) => <button key={view} type="button" aria-pressed={panelView === view} onClick={() => onPanelViewChange(view)} className={styles.viewButton}>{view === "split" && <span aria-hidden="true">▣ </span>}{view.charAt(0).toUpperCase() + view.slice(1)}</button>)}
    </div>}
    <footer className={styles.paging} aria-label="Question controls">
      <button type="button" onClick={() => onNavigate(activeIndex - 1)} disabled={activeIndex === 0} className={styles.pageButton}><span aria-hidden="true">←</span>Back</button>
      {activeIndex < questions.length - 1 ? <button type="button" onClick={() => onNavigate(activeIndex + 1)} className={styles.pageButton}><span aria-hidden="true">→</span>Next</button> : <div className={styles.submitControl}><button type="button" onClick={onSubmit} disabled={!canSubmit} aria-describedby={!canSubmit ? "submit-disabled-reason" : undefined} className={styles.pageButton}><span aria-hidden="true">✓</span>Submit</button>{!canSubmit && <span id="submit-disabled-reason" role="tooltip" className={styles.submitTooltip}>{submitDisabledReason}</span>}</div>}
    </footer>
  </div>;
}

'use client';

// ============================================================================
// Sortable Question Card Component (with @dnd-kit)
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  QuestionItem,
  QuestionCategory,
  QuestionDifficulty,
  useKitEditor,
} from '@/context/kit-editor-context';
import { InlineEdit } from './InlineEdit';

interface SortableQuestionCardProps {
  question: QuestionItem;
  index: number;
  categoryQuestions: QuestionItem[];
  onKeyboardMove?: (direction: 'up' | 'down') => void;
}

const CATEGORY_NAMES: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  system_design: 'System Design',
  company_fit: 'Company Fit',
};

export function SortableQuestionCard({
  question,
  index,
  categoryQuestions,
  onKeyboardMove,
}: SortableQuestionCardProps) {
  const {
    isPinned,
    pin,
    unpin,
    updateQuestion,
    deleteQuestion,
    moveQuestionCategory,
  } = useKitEditor();

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const confirmDeleteBtnRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const pinned = isPinned(question.id);

  // dnd-kit sortable hook
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Auto-focus confirm delete button when opened
  useEffect(() => {
    if (isConfirmingDelete && confirmDeleteBtnRef.current) {
      confirmDeleteBtnRef.current.focus();
    }
  }, [isConfirmingDelete]);

  // Keyboard reordering: Alt+ArrowUp / Alt+ArrowDown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      onKeyboardMove?.('up');
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      onKeyboardMove?.('down');
    }
  };

  const handleDifficultyChange = (newDiff: QuestionDifficulty) => {
    updateQuestion(question.id, { difficulty: newDiff });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCat = e.target.value as QuestionCategory;
    moveQuestionCategory(question.id, newCat);
  };

  const getDifficultyBadge = (diff: string) => {
    switch (diff) {
      case 'hard':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'medium':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'easy':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        cardRef.current = node;
      }}
      style={style}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`group relative bg-slate-900/70 border rounded-2xl p-5 sm:p-6 transition-all duration-200 outline-none focus:ring-2 focus:ring-indigo-500/40 ${
        isDragging
          ? 'opacity-60 border-indigo-500 shadow-2xl z-30'
          : pinned
          ? 'border-indigo-500/40 bg-slate-900/90 shadow-sm'
          : 'border-slate-800/80 hover:border-slate-700/80'
      }`}
    >
      {/* Top Controls Row */}
      <div className="flex items-center justify-between gap-3 mb-3 text-xs">
        {/* Left: Drag Handle, Question Number & ID */}
        <div className="flex items-center space-x-2.5">
          {/* Touch-Friendly Drag Handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder question"
            title="Drag to reorder (or use Alt+Up/Down on card)"
            className="p-1.5 -m-1 text-slate-500 hover:text-slate-200 cursor-grab active:cursor-grabbing rounded hover:bg-slate-800 touch-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>

          <span className="font-mono font-semibold text-slate-400">
            Q{index + 1}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-950 text-slate-500 font-mono text-[10px]">
            {question.id}
          </span>
        </div>

        {/* Right: Badges & Actions */}
        <div className="flex items-center space-x-2">
          {/* Pinned Badge / Unpin Toggle */}
          {pinned ? (
            <div className="flex items-center space-x-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full text-[11px] font-medium">
              <span title="Pinned: Protected from regeneration">📌 Pinned</span>
              <button
                type="button"
                onClick={() => unpin(question.id)}
                className="ml-1 text-amber-400/80 hover:text-amber-100 hover:bg-amber-500/20 rounded p-0.5"
                title="Unpin item (allow regeneration)"
                aria-label={`Unpin question ${question.id}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => pin(question.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-amber-400 px-1.5 py-0.5 rounded hover:bg-slate-800 text-[11px] transition-opacity"
              title="Pin this question to protect it from section regeneration"
              aria-label={`Pin question ${question.id}`}
            >
              Pin 📌
            </button>
          )}

          {/* Difficulty Dropdown */}
          <select
            value={question.difficulty}
            onChange={(e) => handleDifficultyChange(e.target.value as QuestionDifficulty)}
            aria-label={`Difficulty for question ${question.id}`}
            className={`px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${getDifficultyBadge(
              question.difficulty
            )}`}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Category Switcher Dropdown */}
          <select
            value={question.category}
            onChange={handleCategoryChange}
            aria-label={`Move question ${question.id} to another category`}
            className="px-2 py-0.5 rounded-md border border-slate-800 bg-slate-950 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.entries(CATEGORY_NAMES).map(([catKey, catName]) => (
              <option key={catKey} value={catKey}>
                {catName}
              </option>
            ))}
          </select>

          {/* Delete Button with Inline Confirmation */}
          {isConfirmingDelete ? (
            <div className="flex items-center space-x-1.5 bg-rose-500/10 border border-rose-500/30 rounded-md px-2 py-0.5 animate-fade-in">
              <span className="text-[11px] text-rose-300">Delete?</span>
              <button
                ref={confirmDeleteBtnRef}
                type="button"
                onClick={() => deleteQuestion(question.id)}
                aria-label={`Confirm delete question ${question.id}`}
                className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-[11px] transition"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              title="Delete question"
              aria-label={`Delete question ${question.id}`}
              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Question Prompt (Inline Editable) */}
      <div className="mb-4">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          Prompt
        </label>
        <InlineEdit
          value={question.prompt}
          multiline
          onSave={(newPrompt) => updateQuestion(question.id, { prompt: newPrompt })}
          ariaLabel={`Prompt for question ${question.id}`}
          className="font-medium text-white text-base leading-relaxed"
        />
      </div>

      {/* Answer Outline (Inline Editable) */}
      <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
          Expected Answer & Outline
        </label>
        <InlineEdit
          value={question.answer_outline}
          multiline
          onSave={(newOutline) => updateQuestion(question.id, { answer_outline: newOutline })}
          ariaLabel={`Answer outline for question ${question.id}`}
          className="text-sm text-slate-300 leading-relaxed"
        />
      </div>

      {/* Optional: Evaluation Criteria & Rubric */}
      {question.criteria && question.criteria.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800/50">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Key Evaluation Criteria
          </p>
          <ul className="space-y-1">
            {question.criteria.map((c, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start space-x-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

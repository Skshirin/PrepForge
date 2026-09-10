'use client';

// ============================================================================
// Editable Flashcard Component
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { FlashcardItem, useKitEditor } from '@/context/kit-editor-context';
import { InlineEdit } from './InlineEdit';

interface EditableFlashcardProps {
  card: FlashcardItem;
  index: number;
}

export function EditableFlashcard({ card, index }: EditableFlashcardProps) {
  const { isPinned, pin, unpin, updateFlashcard, deleteFlashcard } = useKitEditor();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const confirmDeleteBtnRef = useRef<HTMLButtonElement | null>(null);

  const pinned = isPinned(card.id);

  useEffect(() => {
    if (isConfirmingDelete && confirmDeleteBtnRef.current) {
      confirmDeleteBtnRef.current.focus();
    }
  }, [isConfirmingDelete]);

  return (
    <div
      className={`relative rounded-2xl border p-5 sm:p-6 transition-all duration-200 flex flex-col justify-between ${
        pinned
          ? 'bg-slate-900/90 border-indigo-500/40 shadow-sm'
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700/80'
      }`}
    >
      {/* Top Meta & Controls */}
      <div className="flex items-center justify-between gap-2 mb-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-400 font-mono">#{index + 1}</span>
          <span className="text-slate-500 font-mono text-[10px] bg-slate-950 px-1.5 py-0.5 rounded">
            {card.id}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {pinned ? (
            <div className="flex items-center space-x-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full text-[11px] font-medium">
              <span>📌 Pinned</span>
              <button
                type="button"
                onClick={() => unpin(card.id)}
                className="ml-1 text-amber-400/80 hover:text-amber-100 p-0.5"
                title="Unpin flashcard"
                aria-label={`Unpin flashcard ${card.id}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => pin(card.id)}
              className="text-slate-500 hover:text-amber-400 px-1.5 py-0.5 rounded hover:bg-slate-800 text-[11px]"
              title="Pin this card"
              aria-label={`Pin flashcard ${card.id}`}
            >
              Pin 📌
            </button>
          )}

          {isConfirmingDelete ? (
            <div className="flex items-center space-x-1.5 bg-rose-500/10 border border-rose-500/30 rounded-md px-2 py-0.5">
              <span className="text-[11px] text-rose-300">Delete?</span>
              <button
                ref={confirmDeleteBtnRef}
                type="button"
                onClick={() => deleteFlashcard(card.id)}
                aria-label={`Confirm delete flashcard ${card.id}`}
                className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-[11px]"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              title="Delete flashcard"
              aria-label={`Delete flashcard ${card.id}`}
              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Front & Back Content */}
      <div className="space-y-4 my-2">
        {/* Front (Concept / Question) */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-400 mb-1">
            Prompt / Front
          </label>
          <InlineEdit
            value={card.front}
            multiline
            onSave={(newFront) => updateFlashcard(card.id, { front: newFront })}
            ariaLabel={`Front of card ${card.id}`}
            className="text-white font-medium text-sm leading-relaxed"
          />
        </div>

        {/* Back (Key takeaway / Answer) */}
        <div className="pt-3 border-t border-slate-800/60">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              Answer / Back
            </label>
            <button
              type="button"
              onClick={() => setIsFlipped(!isFlipped)}
              className="text-[11px] text-slate-400 hover:text-indigo-300 underline"
            >
              {isFlipped ? 'Hide back' : 'Reveal back'}
            </button>
          </div>

          {isFlipped ? (
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <InlineEdit
                value={card.back}
                multiline
                onSave={(newBack) => updateFlashcard(card.id, { back: newBack })}
                ariaLabel={`Back of card ${card.id}`}
                className="text-sm text-slate-300 leading-relaxed"
              />
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsFlipped(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsFlipped(true);
                }
              }}
              className="p-3 bg-slate-950/40 border border-slate-800/60 border-dashed rounded-xl text-center text-xs text-slate-500 hover:text-slate-400 cursor-pointer"
            >
              Click to reveal answer
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

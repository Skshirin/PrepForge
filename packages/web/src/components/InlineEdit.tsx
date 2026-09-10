'use client';

// ============================================================================
// Accessible Inline Editing Components
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (val: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export function InlineEdit({
  value,
  onSave,
  multiline = false,
  className = '',
  placeholder = 'Click to edit...',
  ariaLabel = 'Inline editable text',
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // place cursor at end
      if (typeof inputRef.current.selectionStart === 'number') {
        const len = inputRef.current.value.length;
        inputRef.current.selectionStart = len;
        inputRef.current.selectionEnd = len;
      }
    }
  }, [isEditing]);

  const commit = () => {
    if (draft !== value) {
      onSave(draft);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Enter') {
      if (!multiline) {
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        commit();
      }
    }
  };

  if (isEditing) {
    if (multiline) {
      return (
        <div className="relative w-full">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            rows={4}
            aria-label={ariaLabel}
            className={`w-full p-2.5 rounded-lg bg-slate-950 border border-indigo-500 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y ${className}`}
          />
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 px-1">
            <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Ctrl+Enter</kbd> to save, <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Esc</kbd> to cancel</span>
            <div className="space-x-2">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); cancel(); }}
                className="text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(); }}
                className="text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative w-full flex items-center">
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          aria-label={ariaLabel}
          className={`w-full p-1.5 rounded-md bg-slate-950 border border-indigo-500 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${className}`}
        />
        <div className="absolute right-2 flex items-center space-x-1.5 text-[11px] text-slate-400">
          <span className="hidden sm:inline">Enter to save, Esc to cancel</span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
      aria-label={`${ariaLabel} (Click to edit)`}
      className={`group relative cursor-pointer rounded-lg p-1 -m-1 hover:bg-slate-800/50 hover:ring-1 hover:ring-slate-700/60 transition-all duration-150 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={value ? '' : 'text-slate-500 italic'}>
          {value || placeholder}
        </span>
        <span className="opacity-0 group-hover:opacity-100 text-slate-500 group-hover:text-indigo-400 transition-opacity flex-shrink-0 mt-0.5" title="Click to edit">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </span>
      </div>
    </div>
  );
}

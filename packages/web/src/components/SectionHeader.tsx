'use client';

// ============================================================================
// Section Header with Inline Regeneration Confirmation & Status
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { useKitEditor } from '@/context/kit-editor-context';

interface SectionHeaderProps {
  title: string;
  sectionKey: string;
  sectionName: string; // Human readable name (e.g. "Technical Questions", "Company Brief")
  actionButton?: React.ReactNode;
}

export function SectionHeader({
  title,
  sectionKey,
  sectionName,
  actionButton,
}: SectionHeaderProps) {
  const {
    regenerateSection,
    regeneratingSections,
    sectionErrors,
  } = useKitEditor();

  const [isConfirming, setIsConfirming] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const isRegenerating = regeneratingSections.has(sectionKey);
  const error = sectionErrors[sectionKey];

  useEffect(() => {
    if (isConfirming && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [isConfirming]);

  const handleConfirmRegenerate = async () => {
    setIsConfirming(false);
    await regenerateSection(sectionKey);
  };

  return (
    <div className="space-y-2 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <h2 className="text-lg font-semibold text-white tracking-tight flex items-center space-x-2">
          <span>{title}</span>
          {isRegenerating && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <div className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin mr-1.5" />
              Regenerating...
            </span>
          )}
        </h2>

        <div className="flex items-center space-x-3">
          {actionButton}

          {/* Regenerate Trigger & Inline Confirmation */}
          {isConfirming ? (
            <div className="flex items-center space-x-2 bg-slate-900 border border-indigo-500/40 rounded-xl p-1.5 shadow-lg animate-fade-in text-xs">
              <span className="text-slate-300 hidden md:inline px-1">
                Regenerate {sectionName}? Pinned edits are kept.
              </span>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={handleConfirmRegenerate}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => setIsConfirming(true)}
              aria-label={`Regenerate ${sectionName}`}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 transition-all disabled:opacity-50"
            >
              <svg
                className={`w-3.5 h-3.5 text-indigo-400 ${isRegenerating ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{isRegenerating ? 'Regenerating…' : 'Regenerate Section'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Regeneration Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => regenerateSection(sectionKey)}
            className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium transition"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

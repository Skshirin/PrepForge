'use client';

// ============================================================================
// Kit Editor Workspace (Phase 5: Editable, Reorderable, Regeneratable)
// ============================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  useKitEditor,
  QuestionCategory,
  QuestionItem,
} from '@/context/kit-editor-context';
import { SortableQuestionCard } from './SortableQuestionCard';
import { EditableFlashcard } from './EditableFlashcard';
import { InlineAddQuestion, InlineAddFlashcard } from './AddForms';
import { SectionHeader } from './SectionHeader';
import { InlineEdit } from './InlineEdit';

interface KitEditorWorkspaceProps {
  kitId: string;
  stageErrors?: Array<{ stage: string; error: string }>;
}

const CATEGORIES: Array<{ key: QuestionCategory; label: string }> = [
  { key: 'technical', label: 'Technical' },
  { key: 'behavioural', label: 'Behavioural' },
  { key: 'system_design', label: 'System Design' },
  { key: 'company_fit', label: 'Company Fit' },
];

export function KitEditorWorkspace({ kitId, stageErrors = [] }: KitEditorWorkspaceProps) {
  const {
    kit,
    isPinned,
    pin,
    unpin,
    isDirty,
    isSaving,
    savingStatus,
    saveError,
    conflictError,
    regeneratingSections,
    reorderQuestions,
    updateBrief,
    saveNow,
    reloadLatestKit,
  } = useKitEditor();

  const [activeTab, setActiveTab] = useState<
    'questions' | 'schedule' | 'flashcards' | 'brief' | 'coverage'
  >('questions');
  const [activeCategory, setActiveCategory] = useState<QuestionCategory>('technical');
  const [isExporting, setIsExporting] = useState(false);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle Drag & Drop reorder
  const handleDragEnd = (event: DragEndEvent, category: QuestionCategory) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentCatQuestions = kit.questions.filter((q) => q.category === category);
    const oldIndex = currentCatQuestions.findIndex((q) => q.id === active.id);
    const newIndex = currentCatQuestions.findIndex((q) => q.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(currentCatQuestions, oldIndex, newIndex);
      reorderQuestions(category, reordered);
    }
  };

  // Keyboard reorder handler for Alt+Up/Down
  const handleKeyboardMove = (
    index: number,
    direction: 'up' | 'down',
    category: QuestionCategory
  ) => {
    const currentCatQuestions = kit.questions.filter((q) => q.category === category);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < currentCatQuestions.length) {
      const reordered = arrayMove(currentCatQuestions, index, targetIndex);
      reorderQuestions(category, reordered);
    }
  };

  // Export handlers
  const handleExport = async (format: 'json' | 'markdown') => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/kits/${kitId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ format }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download =
        format === 'markdown'
          ? `${(kit.source?.company || 'interview').toLowerCase()}-kit.md`
          : `interview-kit-${kitId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const isBriefPinned = isPinned('company_brief');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Kit Workspace Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                {kit.schedule?.days_available || kit.originalDays || 5}-Day Prep Kit
              </span>
              {kit.status === 'ready' ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready
                </span>
              ) : kit.status === 'partial' ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Partial Research
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Failed
                </span>
              )}

              {/* Concurrency Version Badge */}
              <span className="text-[11px] text-slate-500 font-mono">v{kit.version}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {kit.role?.title || 'Software Engineer'}
            </h1>

            <p className="text-sm text-slate-300 flex items-center space-x-2">
              <span>{kit.source?.company || 'Company'}</span>
              {kit.source?.company_url && (
                <a
                  href={kit.source.company_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                  {kit.source.company_url}
                </a>
              )}
            </p>
          </div>

          {/* Right Action Bar: Auto-Save Indicator & Exports */}
          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            {/* Auto-Save Visual Indicator */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              {savingStatus === 'saving' ? (
                <div className="flex items-center space-x-1.5 text-indigo-400">
                  <div className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                  <span>Saving…</span>
                </div>
              ) : savingStatus === 'saved' ? (
                <div className="flex items-center space-x-1.5 text-emerald-400 animate-fade-in">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Saved</span>
                </div>
              ) : savingStatus === 'conflict' ? (
                <div className="flex items-center space-x-1 text-amber-400">
                  <span>Kit updated elsewhere, reloading…</span>
                </div>
              ) : isDirty ? (
                <button
                  type="button"
                  onClick={() => saveNow()}
                  className="flex items-center space-x-1.5 text-amber-300 hover:text-amber-200"
                  title="Click to save now (or auto-saves in 2s)"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Unsaved changes (Save)</span>
                </button>
              ) : (
                <span className="text-slate-500">All changes saved</span>
              )}
            </div>

            {/* Export Buttons */}
            <button
              onClick={() => handleExport('markdown')}
              disabled={isExporting}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center space-x-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export Markdown</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              disabled={isExporting}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center space-x-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span>Export JSON</span>
            </button>
          </div>
        </div>

        {/* Conflict Error Notice */}
        {conflictError && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
            <span>Kit was updated elsewhere, reloading latest version…</span>
            <button
              onClick={() => reloadLatestKit()}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium"
            >
              Reload Now
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-b border-slate-800 pt-4 overflow-x-auto">
          {[
            { key: 'questions', label: `Questions (${kit.questions?.length || 0})` },
            { key: 'schedule', label: `Study Schedule (${kit.schedule?.days?.length || 0} Days)` },
            { key: 'flashcards', label: `Flashcards (${kit.flashcards?.length || 0})` },
            { key: 'brief', label: 'Company Brief' },
            { key: 'coverage', label: 'Coverage Report' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Partial Research Warnings */}
      {(kit.status === 'partial' || stageErrors.length > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-2.5">
          <div className="flex items-center space-x-2 text-amber-400 font-semibold text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Notice: Kit generated with partial research or stage warnings</span>
          </div>
          <p className="text-xs text-amber-200/80">
            Some research stages encountered errors or were skipped. Fallbacks were used and all items remain editable and regeneratable.
          </p>
          {stageErrors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-300/90 list-disc list-inside">
              {stageErrors.map((err, i) => (
                <li key={i}>
                  <span className="font-semibold">{err.stage}:</span> {err.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* TAB CONTENTS */}
      <div className="space-y-6">
        {/* ==================================================================== */}
        {/* TAB 1: QUESTIONS (Sortable by Category)                             */}
        {/* ==================================================================== */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            {/* Category Selector Sub-nav */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-xl">
              {CATEGORIES.map((cat) => {
                const count = kit.questions.filter((q) => q.category === cat.key).length;
                const isSelected = activeCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveCategory(cat.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Current Category Questions Section */}
            {(() => {
              const currentCat = activeCategory;
              const sectionKey = `questions_${currentCat}`;
              const isSectionRegenerating =
                regeneratingSections.has(sectionKey) || regeneratingSections.has('questions');
              const catQuestions = kit.questions.filter((q) => q.category === currentCat);

              return (
                <div className="relative space-y-4">
                  {/* Section Header with Regenerate */}
                  <SectionHeader
                    title={`${CATEGORIES.find((c) => c.key === currentCat)?.label} Questions`}
                    sectionKey={sectionKey}
                    sectionName={`${CATEGORIES.find((c) => c.key === currentCat)?.label} Questions`}
                  />

                  {/* Regenerating Skeleton Overlay */}
                  {isSectionRegenerating && (
                    <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-8 space-y-3">
                      <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                      <p className="text-sm font-medium text-white">
                        Regenerating {CATEGORIES.find((c) => c.key === currentCat)?.label} questions…
                      </p>
                      <p className="text-xs text-slate-400">
                        Your pinned edits will be preserved. Other sections remain interactive.
                      </p>
                    </div>
                  )}

                  {/* Dnd-kit Sortable Context */}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleDragEnd(e, currentCat)}
                  >
                    <SortableContext
                      items={catQuestions.map((q) => q.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {catQuestions.map((q, idx) => (
                          <SortableQuestionCard
                            key={q.id}
                            question={q}
                            index={idx}
                            categoryQuestions={catQuestions}
                            onKeyboardMove={(direction) =>
                              handleKeyboardMove(idx, direction, currentCat)
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  {/* Inline Add Question Button/Form */}
                  <InlineAddQuestion category={currentCat} />
                </div>
              );
            })()}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: STUDY SCHEDULE                                                */}
        {/* ==================================================================== */}
        {activeTab === 'schedule' && (
          <div className="relative space-y-4">
            <SectionHeader
              title="Daily Preparation Schedule"
              sectionKey="schedule"
              sectionName="Study Schedule"
            />

            {regeneratingSections.has('schedule') && (
              <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-8 space-y-3">
                <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm font-medium text-white">Regenerating study schedule…</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(kit.schedule?.days || []).map((day) => (
                <div
                  key={day.day}
                  className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-400 tracking-wider uppercase">
                      Day {day.day}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                      {day.minutes} mins
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-white">{day.focus}</h3>

                  {day.question_ids && day.question_ids.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60">
                      <p className="text-xs text-slate-400 mb-1.5">Questions to cover:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {day.question_ids.map((qid) => (
                          <span
                            key={qid}
                            className="px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40 text-indigo-300 text-xs font-mono"
                          >
                            {qid}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: FLASHCARDS                                                    */}
        {/* ==================================================================== */}
        {activeTab === 'flashcards' && (
          <div className="relative space-y-6">
            <SectionHeader
              title={`Study Flashcards (${kit.flashcards?.length || 0})`}
              sectionKey="flashcards"
              sectionName="Flashcards"
              actionButton={
                <Link
                  href={`/kits/${kitId}/practice`}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-600/30 transition-all duration-150"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Practice Flashcards</span>
                </Link>
              }
            />

            {/* Practice Banner */}
            <div className="bg-gradient-to-r from-indigo-950/60 to-violet-950/40 border border-indigo-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Interactive Flashcard Practice Mode</h3>
                <p className="text-xs text-slate-400">
                  Review your flashcards with 3D flips, confidence tracking (😟 Again, 😐 Unsure, 😊 Got it), and weak-spot prioritization.
                </p>
              </div>
              <Link
                href={`/kits/${kitId}/practice`}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Start Practice Mode</span>
              </Link>
            </div>

            {regeneratingSections.has('flashcards') && (
              <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-8 space-y-3">
                <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm font-medium text-white">Regenerating flashcards…</p>
                <p className="text-xs text-slate-400">Pinned flashcards are kept.</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {(kit.flashcards || []).map((card, idx) => (
                <EditableFlashcard key={card.id} card={card} index={idx} />
              ))}
            </div>

            <InlineAddFlashcard />
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: COMPANY BRIEF (Editable Summary & What They Do)               */}
        {/* ==================================================================== */}
        {activeTab === 'brief' && (
          <div className="relative space-y-6">
            <SectionHeader
              title="Company Overview & Culture Brief"
              sectionKey="company_brief"
              sectionName="Company Brief"
              actionButton={
                isBriefPinned ? (
                  <div className="flex items-center space-x-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-full text-xs font-medium">
                    <span>📌 Brief Pinned</span>
                    <button
                      type="button"
                      onClick={() => unpin('company_brief')}
                      className="ml-1 text-amber-400 hover:text-amber-100"
                      title="Unpin company brief"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => pin('company_brief')}
                    className="text-slate-500 hover:text-amber-400 px-2 py-1 rounded hover:bg-slate-800 text-xs"
                  >
                    Pin Brief 📌
                  </button>
                )
              }
            />

            {regeneratingSections.has('company_brief') && (
              <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-8 space-y-3">
                <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm font-medium text-white">Regenerating company brief…</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Executive Summary */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Executive Summary
                </h3>
                <InlineEdit
                  value={kit.company_brief?.summary || ''}
                  multiline
                  placeholder="Click to add executive summary..."
                  onSave={(newVal) => updateBrief({ summary: newVal })}
                  ariaLabel="Company summary"
                  className="text-sm text-slate-300 leading-relaxed"
                />
              </div>

              {/* What They Do */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  What They Do & Product
                </h3>
                <InlineEdit
                  value={kit.company_brief?.what_they_do || ''}
                  multiline
                  placeholder="Click to add product and company info..."
                  onSave={(newVal) => updateBrief({ what_they_do: newVal })}
                  ariaLabel="What they do"
                  className="text-sm text-slate-300 leading-relaxed"
                />
              </div>

              {/* Business Model */}
              {kit.company_brief?.business_model && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Business Model & Monetization
                  </h3>
                  <InlineEdit
                    value={kit.company_brief.business_model}
                    multiline
                    onSave={(newVal) => updateBrief({ business_model: newVal })}
                    ariaLabel="Business model"
                    className="text-sm text-slate-300 leading-relaxed"
                  />
                </div>
              )}

              {/* Engineering Culture */}
              {kit.company_brief?.engineering_culture && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Engineering Culture & Values
                  </h3>
                  <InlineEdit
                    value={kit.company_brief.engineering_culture}
                    multiline
                    onSave={(newVal) => updateBrief({ engineering_culture: newVal })}
                    ariaLabel="Engineering culture"
                    className="text-sm text-slate-300 leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Recent News & Interview Tips */}
            {kit.company_brief?.recent_news && kit.company_brief.recent_news.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Recent News & Discussions
                </h3>
                <ul className="space-y-2">
                  {kit.company_brief.recent_news.map((item, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start space-x-2">
                      <span className="text-indigo-400 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: COVERAGE REPORT                                               */}
        {/* ==================================================================== */}
        {activeTab === 'coverage' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Requirement Coverage & Gap Analysis
              </h2>
              <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                Pipeline passes: {kit.coverage?.passes || 1}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Role Requirements List */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Extracted Requirements ({kit.role?.requirements?.length || 0})
                </h3>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {(kit.role?.requirements || []).map((req) => {
                    const isUncovered = (kit.coverage?.uncovered_requirement_ids || []).includes(
                      req.id
                    );
                    return (
                      <div
                        key={req.id}
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          isUncovered
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-slate-500">{req.id}</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 font-semibold text-[10px] uppercase">
                              {req.priority}
                            </span>
                            {isUncovered ? (
                              <span className="text-rose-400 font-medium text-[10px]">Uncovered</span>
                            ) : (
                              <span className="text-emerald-400 font-medium text-[10px]">Covered ✓</span>
                            )}
                          </div>
                        </div>
                        <p>{req.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gaps / Uncovered Analysis */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Coverage Status
                </h3>
                {(kit.coverage?.uncovered_requirement_ids || []).length === 0 ? (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center space-x-3">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>100% of requirements are covered by questions and schedule!</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                      {kit.coverage?.uncovered_requirement_ids?.length} requirement(s) are not yet covered.
                    </div>
                    {(kit.coverage?.gaps || []).map((gap, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                        <span className="font-mono text-indigo-400">{gap.requirement_id}</span>
                        <p className="text-slate-300">{gap.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

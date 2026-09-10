'use client';

// ============================================================================
// Inline Add Question & Flashcard Forms
// ============================================================================

import React, { useState } from 'react';
import {
  QuestionCategory,
  QuestionDifficulty,
  useKitEditor,
} from '@/context/kit-editor-context';

export function InlineAddQuestion({ category }: { category: QuestionCategory }) {
  const { addQuestion } = useKitEditor();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [outline, setOutline] = useState('');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    addQuestion({
      category,
      difficulty,
      prompt: prompt.trim(),
      answer_outline: outline.trim() || 'Key technical concepts and approach.',
    });

    setPrompt('');
    setOutline('');
    setDifficulty('medium');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full py-3 px-4 border border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 text-slate-400 hover:text-indigo-300 rounded-2xl text-xs font-medium transition-colors flex items-center justify-center space-x-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Add Question to this Category</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-5 shadow-xl space-y-4 animate-fade-in"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
          New Question ({category})
        </h3>
        <div className="flex items-center space-x-2">
          <label className="text-xs text-slate-400">Difficulty:</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-300 mb-1">Question Prompt</label>
        <textarea
          required
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. How do you design an idempotent payment processing API?"
          className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-300 mb-1">Expected Answer / Outline</label>
        <textarea
          rows={3}
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
          placeholder="Key points candidate should cover..."
          className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex items-center justify-end space-x-2 pt-1">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition"
        >
          Add Question 📌
        </button>
      </div>
    </form>
  );
}

export function InlineAddFlashcard() {
  const { addFlashcard } = useKitEditor();
  const [isOpen, setIsOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim()) return;

    addFlashcard({
      front: front.trim(),
      back: back.trim() || 'Core concepts and key terms.',
    });

    setFront('');
    setBack('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full py-3 px-4 border border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 text-slate-400 hover:text-indigo-300 rounded-2xl text-xs font-medium transition-colors flex items-center justify-center space-x-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Add Flashcard</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-5 shadow-xl space-y-4 animate-fade-in"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
        New Flashcard
      </h3>

      <div>
        <label className="block text-xs text-slate-300 mb-1">Front (Prompt / Concept)</label>
        <textarea
          required
          rows={2}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="e.g. CAP Theorem Trade-offs"
          className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-300 mb-1">Back (Takeaway / Answer)</label>
        <textarea
          rows={3}
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="Consistency vs Availability under Network Partitions..."
          className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex items-center justify-end space-x-2 pt-1">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition"
        >
          Add Flashcard 📌
        </button>
      </div>
    </form>
  );
}

'use client';

// ============================================================================
// Flashcard Practice Mode (/kits/[id]/practice)
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';

interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  category?: string;
  tags?: string[];
}

interface FlashcardProgress {
  flashcardId: string;
  confidence: number; // 1, 2, 3
  lastReviewedAt: string;
  reviewCount: number;
}

interface PracticeState {
  flashcardProgress: FlashcardProgress[];
  lastSessionAt?: string;
  totalSessions: number;
}

interface KitData {
  _id: string;
  id?: string;
  status: string;
  version: number;
  source: {
    company: string;
  };
  role: {
    title: string;
  };
  flashcards: FlashcardItem[];
  practiceState?: PracticeState;
}

export default function PracticeModePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const kitId = params?.id as string;

  const [kit, setKit] = useState<KitData | null>(null);
  const [isLoadingKit, setIsLoadingKit] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Session state
  const [sessionCards, setSessionCards] = useState<FlashcardItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSessionEnded, setIsSessionEnded] = useState(false);

  // Tracking for this current practice session
  const [sessionRatings, setSessionRatings] = useState<
    Array<{ cardId: string; front: string; back: string; category?: string; confidence: number }>
  >([]);
  const [seenCardIds, setSeenCardIds] = useState<Set<string>>(new Set());
  const [practiceState, setPracticeState] = useState<PracticeState>({
    flashcardProgress: [],
    totalSessions: 0,
  });

  // Auth guard
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace(`/login?redirect=/kits/${kitId}/practice`);
    }
  }, [user, isAuthLoading, router, kitId]);

  // Load Kit
  const fetchKit = useCallback(async () => {
    try {
      const res = await api.get<{ kit: KitData }>(`/api/kits/${kitId}`);
      setKit(res.kit);

      const existingPractice: PracticeState = res.kit.practiceState || {
        flashcardProgress: [],
        totalSessions: 0,
      };
      setPracticeState(existingPractice);

      const progressMap = new Map<string, FlashcardProgress>();
      (existingPractice.flashcardProgress || []).forEach((p) => {
        progressMap.set(p.flashcardId, p);
      });

      // Confidence-weighted session ordering:
      // Cards never seen come first (reviewCount === 0), then lowest confidence score (1 -> 2 -> 3)
      const sortedCards = [...(res.kit.flashcards || [])].sort((a, b) => {
        const progA = progressMap.get(a.id);
        const progB = progressMap.get(b.id);

        const seenA = progA && progA.reviewCount > 0;
        const seenB = progB && progB.reviewCount > 0;

        // Unseen first
        if (!seenA && seenB) return -1;
        if (seenA && !seenB) return 1;
        if (!seenA && !seenB) return 0;

        // Lowest confidence first
        const confA = progA ? progA.confidence : 0;
        const confB = progB ? progB.confidence : 0;
        return confA - confB;
      });

      setSessionCards(sortedCards);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load flashcards for practice.');
    } finally {
      setIsLoadingKit(false);
    }
  }, [kitId]);

  useEffect(() => {
    if (user && kitId) {
      fetchKit();
    }
  }, [user, kitId, fetchKit]);

  // Current Card
  const currentCard = sessionCards[currentIndex] || null;

  // Flip Action
  const toggleFlip = useCallback(() => {
    if (!currentCard || isSessionEnded) return;
    setIsFlipped((prev) => !prev);
  }, [currentCard, isSessionEnded]);

  // Advance to next card or finish session
  const advanceCard = useCallback(() => {
    setIsFlipped(false);
    if (currentIndex + 1 < sessionCards.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsSessionEnded(true);
    }
  }, [currentIndex, sessionCards.length]);

  // Save rating to practiceState and backend
  const handleRate = useCallback(
    async (confidence: number) => {
      if (!currentCard || !isFlipped) return;

      // Update session rating record
      setSessionRatings((prev) => [
        ...prev.filter((r) => r.cardId !== currentCard.id),
        {
          cardId: currentCard.id,
          front: currentCard.front,
          back: currentCard.back,
          category: currentCard.category,
          confidence,
        },
      ]);

      setSeenCardIds((prev) => {
        const next = new Set(prev);
        next.add(currentCard.id);
        return next;
      });

      // Update persistent practiceState
      const existingProg = practiceState.flashcardProgress || [];
      const idx = existingProg.findIndex((p) => p.flashcardId === currentCard.id);
      const updatedProgress = [...existingProg];

      if (idx >= 0) {
        updatedProgress[idx] = {
          flashcardId: currentCard.id,
          confidence,
          lastReviewedAt: new Date().toISOString(),
          reviewCount: (updatedProgress[idx].reviewCount || 0) + 1,
        };
      } else {
        updatedProgress.push({
          flashcardId: currentCard.id,
          confidence,
          lastReviewedAt: new Date().toISOString(),
          reviewCount: 1,
        });
      }

      const nextPracticeState: PracticeState = {
        flashcardProgress: updatedProgress,
        lastSessionAt: new Date().toISOString(),
        totalSessions: practiceState.totalSessions || 1,
      };

      setPracticeState(nextPracticeState);

      // Persist to backend
      try {
        await api.put(`/api/kits/${kitId}`, {
          practiceState: nextPracticeState,
        });
      } catch (err) {
        console.error('Failed to sync practice rating:', err);
      }

      advanceCard();
    },
    [currentCard, isFlipped, practiceState, kitId, advanceCard]
  );

  // Skip card without rating
  const handleSkip = useCallback(() => {
    if (currentCard) {
      setSeenCardIds((prev) => {
        const next = new Set(prev);
        next.add(currentCard.id);
        return next;
      });
    }
    advanceCard();
  }, [currentCard, advanceCard]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSessionEnded) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleFlip();
      } else if (isFlipped && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        handleRate(parseInt(e.key, 10));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFlip, handleRate, handleSkip, isFlipped, isSessionEnded]);

  // Restart practice session
  const restartSession = () => {
    setIsFlipped(false);
    setCurrentIndex(0);
    setSessionRatings([]);
    setSeenCardIds(new Set());
    setIsSessionEnded(false);
  };

  // Summary Metrics
  const weakSpots = useMemo(
    () => sessionRatings.filter((r) => r.confidence === 1),
    [sessionRatings]
  );

  const avgSessionConfidence = useMemo(() => {
    if (sessionRatings.length === 0) return 0;
    const sum = sessionRatings.reduce((acc, r) => acc + r.confidence, 0);
    return (sum / sessionRatings.length).toFixed(1);
  }, [sessionRatings]);

  // Overall Coverage Metrics
  const overallMetrics = useMemo(() => {
    const total = kit?.flashcards?.length || 0;
    const progressList = practiceState.flashcardProgress || [];
    const seenEverIds = new Set(
      progressList.filter((p) => p.reviewCount > 0).map((p) => p.flashcardId)
    );
    const seenEverCount = seenEverIds.size;
    const neverSeenCount = Math.max(0, total - seenEverCount);

    return {
      total,
      seenEverCount,
      neverSeenCount,
      percentSeen: total > 0 ? Math.round((seenEverCount / total) * 100) : 0,
    };
  }, [kit?.flashcards, practiceState.flashcardProgress]);

  if (isAuthLoading || isLoadingKit) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[70vh]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Preparing flashcards...</p>
        </div>
      </div>
    );
  }

  if (loadError || !kit) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 space-y-4">
          <p className="text-sm">{loadError || 'Kit not found'}</p>
          <Link
            href={`/kits/${kitId}`}
            className="inline-flex px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-medium"
          >
            Back to Kit
          </Link>
        </div>
      </div>
    );
  }

  if (sessionCards.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-lg font-semibold text-white">No flashcards in this kit</h2>
        <p className="text-xs text-slate-400">Add or generate flashcards in the kit builder first.</p>
        <Link
          href={`/kits/${kitId}`}
          className="inline-flex px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium"
        >
          Back to Kit
        </Link>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 1: SESSION END SUMMARY VIEW
  // ==========================================================================
  if (isSessionEnded) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8 animate-fade-in">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <span className="text-xs uppercase tracking-wider text-indigo-400 font-bold">
              Session Completed
            </span>
            <h1 className="text-2xl font-bold text-white mt-1">Practice Summary</h1>
          </div>
          <Link
            href={`/kits/${kitId}`}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white transition flex items-center space-x-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to kit</span>
          </Link>
        </div>

        {/* Session Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 text-center space-y-1">
            <span className="text-xs text-slate-400">Cards Reviewed</span>
            <p className="text-3xl font-extrabold text-white">{sessionRatings.length}</p>
            <span className="text-[11px] text-slate-500">out of {sessionCards.length} in kit</span>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 text-center space-y-1">
            <span className="text-xs text-slate-400">Average Confidence</span>
            <p className="text-3xl font-extrabold text-indigo-400">
              {sessionRatings.length > 0 ? `${avgSessionConfidence} / 3` : 'N/A'}
            </p>
            <span className="text-[11px] text-slate-500">1: Again, 2: Unsure, 3: Got it</span>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 text-center space-y-1">
            <span className="text-xs text-slate-400">Needs Review (😟)</span>
            <p className="text-3xl font-extrabold text-rose-400">{weakSpots.length}</p>
            <span className="text-[11px] text-slate-500">Flagged as weak spots</span>
          </div>
        </div>

        {/* Weak Spots List */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-400 flex items-center space-x-2">
              <span>Weak Spots Identified ({weakSpots.length})</span>
            </h2>
            <span className="text-xs text-slate-500">Prioritized for upcoming reviews</span>
          </div>

          {weakSpots.length === 0 ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Great job! No cards were rated as difficult in this session.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {weakSpots.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/20 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-rose-300">😟 Needs Review</span>
                    <span className="font-mono text-slate-500">{item.cardId}</span>
                  </div>
                  <p className="text-white font-medium">{item.front}</p>
                  <p className="text-slate-400 pt-1 border-t border-slate-900">{item.back}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overall Flashcard Coverage Tracker */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Overall Kit Flashcard Coverage
          </h2>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-300 font-mono">
              <span>{overallMetrics.seenEverCount} of {overallMetrics.total} cards seen across all sessions</span>
              <span>{overallMetrics.percentSeen}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${overallMetrics.percentSeen}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs text-slate-400">
            <div>
              <span className="text-slate-500 block text-[11px]">Never Seen:</span>
              <span className="font-semibold text-white">{overallMetrics.neverSeenCount} cards</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Total Kit Flashcards:</span>
              <span className="font-semibold text-white">{overallMetrics.total} cards</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Practice Model:</span>
              <span className="font-semibold text-white">Confidence-weighted</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 pt-4">
          <Link
            href={`/kits/${kitId}`}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition"
          >
            Back to Kit Viewer
          </Link>
          <button
            type="button"
            onClick={restartSession}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white shadow-md shadow-indigo-600/30 transition"
          >
            Practice Again
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 2: FULLSCREEN 3D PRACTICE FLASHCARD VIEW
  // ==========================================================================
  return (
    <div className="min-h-[85vh] flex flex-col justify-between max-w-4xl mx-auto px-4 py-6 w-full space-y-6">
      {/* Top Bar: Nav link, Progress Bar, Seen status strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <Link
            href={`/kits/${kitId}`}
            className="text-slate-400 hover:text-white flex items-center space-x-1.5 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to kit</span>
          </Link>

          <span className="font-mono text-slate-400 text-xs">
            Card <strong className="text-white">{currentIndex + 1}</strong> of{' '}
            <strong className="text-white">{sessionCards.length}</strong>
          </span>

          <button
            type="button"
            onClick={handleSkip}
            className="text-slate-500 hover:text-slate-300 text-xs underline"
            title="Skip without rating (→)"
          >
            Skip card →
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
            style={{
              width: `${Math.round(((currentIndex + 1) / sessionCards.length) * 100)}%`,
            }}
          />
        </div>

        {/* Coverage Strip: Seen vs Unseen this session */}
        <div className="flex items-center space-x-1 overflow-x-auto py-1">
          {sessionCards.map((c, i) => {
            const isCurrent = i === currentIndex;
            const isSeen = seenCardIds.has(c.id);

            return (
              <div
                key={c.id}
                title={`Card ${i + 1}: ${isSeen ? 'Reviewed' : 'Unreviewed'}`}
                className={`h-1.5 flex-1 rounded-full transition-all min-w-[6px] ${
                  isCurrent
                    ? 'bg-indigo-400 ring-2 ring-indigo-400/40'
                    : isSeen
                    ? 'bg-emerald-500/80'
                    : 'bg-slate-800'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* 3D Flippable Card Stage */}
      <div className="flex-1 flex flex-col items-center justify-center my-4">
        <div
          role="button"
          tabIndex={0}
          onClick={toggleFlip}
          aria-label={isFlipped ? 'Flashcard answer revealed. Click or press Space to flip.' : 'Flashcard question. Click or press Space to reveal answer.'}
          className="perspective-1000 w-full max-w-2xl h-[340px] sm:h-[380px] cursor-pointer focus:outline-none"
        >
          <div
            className={`w-full h-full relative transition-transform duration-500 transform-style-3d rounded-3xl ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
          >
            {/* FRONT FACE */}
            <div className="absolute inset-0 w-full h-full backface-hidden bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-indigo-400">
                  Prompt / Question
                </span>
                <span className="font-mono text-slate-500 text-[11px] bg-slate-950 px-2 py-0.5 rounded">
                  Space or click to flip
                </span>
              </div>

              <div className="text-center my-auto px-4">
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
                  {currentCard?.front}
                </h2>
              </div>

              <div className="text-center text-xs text-slate-500 flex items-center justify-center space-x-1.5">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Click or press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Space</kbd> to reveal answer</span>
              </div>
            </div>

            {/* BACK FACE */}
            <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-slate-900 border border-indigo-500/40 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-emerald-400">
                  Key Takeaway / Answer
                </span>
                <span className="font-mono text-slate-500 text-[11px] bg-slate-950 px-2 py-0.5 rounded">
                  Rate your confidence below
                </span>
              </div>

              <div className="text-center my-auto px-4 overflow-y-auto max-h-[220px]">
                <p className="text-base sm:text-lg text-slate-100 leading-relaxed">
                  {currentCard?.back}
                </p>
              </div>

              <div className="text-center text-xs text-slate-500">
                <span>Select 1, 2, or 3 below to rate how well you knew this</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar: Confidence Buttons or Flip Prompt */}
      <div className="pb-4">
        {isFlipped ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in">
            {/* Rating 1: Again */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRate(1);
              }}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-medium text-sm flex items-center justify-center space-x-2 transition-transform active:scale-95"
            >
              <span className="text-base">😟</span>
              <span>Again</span>
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-rose-950/80 text-rose-300 font-mono ml-1">1</kbd>
            </button>

            {/* Rating 2: Unsure */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRate(2);
              }}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium text-sm flex items-center justify-center space-x-2 transition-transform active:scale-95"
            >
              <span className="text-base">😐</span>
              <span>Unsure</span>
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-amber-950/80 text-amber-300 font-mono ml-1">2</kbd>
            </button>

            {/* Rating 3: Got it */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRate(3);
              }}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-medium text-sm flex items-center justify-center space-x-2 transition-transform active:scale-95"
            >
              <span className="text-base">😊</span>
              <span>Got it</span>
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-emerald-950/80 text-emerald-300 font-mono ml-1">3</kbd>
            </button>
          </div>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={toggleFlip}
              className="px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 transition-all active:scale-95"
            >
              Reveal Answer (Space)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

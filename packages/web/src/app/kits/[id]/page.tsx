'use client';

// ============================================================================
// Kit Detail & Generation Progress Page (/kits/[id])
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { api, buildUrl } from '@/lib/api';
import { KitEditorProvider } from '@/context/kit-editor-context';
import { KitEditorWorkspace } from '@/components/KitEditorWorkspace';

// All 13 human-readable stage descriptions
const STAGE_LABELS: Record<string, string> = {
  extract_requirements: 'Extracting requirements from job description',
  crawl_company_site: 'Crawling company website & careers pages',
  find_hiring_page: 'Analyzing hiring process & interview guidelines',
  search_public_discussion: 'Researching community interview experiences',
  generate_company_brief: 'Generating company overview & culture brief',
  generate_questions_technical: 'Generating technical interview questions',
  generate_questions_behavioural: 'Generating behavioural & leadership questions',
  generate_questions_system_design: 'Generating system design scenarios',
  generate_questions_company_fit: 'Generating company-fit questions',
  generate_flashcards: 'Assembling study flashcards',
  coverage_check: 'Checking requirement coverage & filling gaps',
  build_schedule: 'Building day-by-day study schedule',
  validate_kit: 'Validating final kit schema & assembling deliverables',
};

const STAGE_ORDER = Object.keys(STAGE_LABELS);

export default function KitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const kitId = params?.id as string;

  // Kit data state
  const [kit, setKit] = useState<any>(null);
  const [isLoadingKit, setIsLoadingKit] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Generation progress state
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [stageDescription, setStageDescription] = useState('Initializing generation pipeline...');
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [stageErrors, setStageErrors] = useState<Array<{ stage: string; error: string }>>([]);
  const [isUsingPolling, setIsUsingPolling] = useState(false);

  // SSE event source reference
  const sseRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auth protection
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace(`/login?redirect=/kits/${kitId}`);
    }
  }, [user, isAuthLoading, router, kitId]);

  // Load kit details
  const fetchKit = useCallback(async () => {
    try {
      const res = await api.get<{ kit: any }>(`/api/kits/${kitId}`);
      setKit(res.kit);

      // Fetch generation job details to inspect stage errors if partial or completed
      if (res.kit?.generationJobId) {
        try {
          const jobRes = await api.get<any>(`/api/generation/${res.kit.generationJobId}`);
          if (jobRes?.stages) {
            const failed = jobRes.stages.filter(
              (s: any) => s.status === 'failed' || s.status === 'skipped' || s.error
            );
            setStageErrors(
              failed.map((s: any) => ({
                stage: STAGE_LABELS[s.name] || s.name,
                error:
                  s.error ||
                  (s.status === 'skipped'
                    ? 'Skipped due to upstream issue'
                    : 'Stage completed with warnings'),
              }))
            );
          }
        } catch {
          // Non-blocking
        }
      }

      return res.kit;
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load interview kit.');
      return null;
    } finally {
      setIsLoadingKit(false);
    }
  }, [kitId]);

  useEffect(() => {
    if (user && kitId) {
      fetchKit();
    }
  }, [user, kitId, fetchKit]);

  // Handle SSE connection & Polling fallback
  useEffect(() => {
    if (!kit || kit.status !== 'generating') {
      return;
    }

    const jobId = kit.generationJobId;
    if (!jobId) {
      return;
    }

    let isTerminated = false;

    const cleanupStreams = () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const handleJobFinished = async () => {
      if (isTerminated) return;
      isTerminated = true;
      cleanupStreams();
      // Reload kit without page reload to transition into kit viewer
      await fetchKit();
    };

    // Polling fallback
    const startPolling = () => {
      if (isTerminated || pollTimerRef.current) return;
      setIsUsingPolling(true);

      pollTimerRef.current = setInterval(async () => {
        try {
          const jobRes = await api.get<any>(`/api/generation/${jobId}`);
          setProgress(jobRes.progress || 0);
          setCurrentStage(jobRes.currentStage || '');
          if (jobRes.currentStage && STAGE_LABELS[jobRes.currentStage]) {
            setStageDescription(STAGE_LABELS[jobRes.currentStage]);
          }
          const completed = (jobRes.stages || [])
            .filter((s: any) => s.status === 'completed')
            .map((s: any) => s.name);
          setCompletedStages(completed);

          if (['completed', 'partial', 'failed'].includes(jobRes.status)) {
            await handleJobFinished();
          }
        } catch {
          // Keep polling
        }
      }, 3000);
    };

    // Start SSE stream
    try {
      const sseUrl = buildUrl(`/api/generation/${jobId}/progress`);
      const eventSource = new EventSource(sseUrl, { withCredentials: true });
      sseRef.current = eventSource;

      eventSource.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data);
          if (typeof data.progress === 'number') {
            setProgress(data.progress);
          }
          if (data.stage) {
            setCurrentStage(data.stage);
            setStageDescription(STAGE_LABELS[data.stage] || data.stageDescription || data.stage);
          }
          if (Array.isArray(data.completedStages)) {
            setCompletedStages(data.completedStages);
          }

          if (['completed', 'partial', 'failed'].includes(data.status)) {
            await handleJobFinished();
          }
        } catch {
          // Non-JSON message (e.g. heartbeat)
        }
      };

      eventSource.onerror = () => {
        // SSE error or disconnection — fall back to polling
        cleanupStreams();
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      isTerminated = true;
      cleanupStreams();
    };
  }, [kit?.status, kit?.generationJobId, fetchKit]);

  if (isAuthLoading || isLoadingKit) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading interview kit...</p>
        </div>
      </div>
    );
  }

  if (loadError || !kit) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
          <h2 className="text-lg font-semibold mb-2">Could not open kit</h2>
          <p className="text-sm">{loadError || 'Kit not found.'}</p>
          <div className="mt-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-slate-800 hover:bg-slate-700 transition"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 1: Generation Progress View (status === 'generating')
  // ==========================================================================
  if (kit.status === 'generating') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="text-center space-y-3 mb-8">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Pipeline Active
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Generating your interview kit
          </h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {stageDescription}
          </p>
          <p className="text-xs text-slate-500 italic">
            This usually takes 60–90 seconds. You can stay on this page or come back anytime.
          </p>
        </div>

        {/* Animated Progress Bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 mb-8">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-indigo-400 uppercase tracking-wider">Overall Progress</span>
              <span className="text-white font-mono">{progress}%</span>
            </div>
            <div className="h-3.5 w-full bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 shadow-sm shadow-indigo-500/50"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
            {isUsingPolling && (
              <p className="text-[11px] text-slate-500 text-right">Streaming fallback: polling mode</p>
            )}
          </div>

          {/* Checklist of Stages */}
          <div className="space-y-2.5 pt-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Pipeline Stages Checklist
            </h3>

            <div className="grid grid-cols-1 gap-2">
              {STAGE_ORDER.map((stageKey, idx) => {
                const isCompleted = completedStages.includes(stageKey);
                const isCurrent = currentStage === stageKey;

                return (
                  <div
                    key={stageKey}
                    className={`flex items-center space-x-3 px-3.5 py-2 rounded-xl text-sm transition-all duration-200 ${
                      isCompleted
                        ? 'bg-slate-950/60 border border-emerald-500/20 text-slate-200'
                        : isCurrent
                        ? 'bg-indigo-950/40 border border-indigo-500/30 text-white font-medium shadow-sm'
                        : 'bg-slate-950/20 border border-transparent text-slate-600'
                    }`}
                  >
                    {/* Icon */}
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {isCompleted ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isCurrent ? (
                        <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-slate-700" />
                      )}
                    </div>

                    <span className="text-xs sm:text-sm truncate">
                      {idx + 1}. {STAGE_LABELS[stageKey]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 2: Kit Editor Workspace (Phase 5: Interactive Kit Builder)
  // ==========================================================================
  return (
    <KitEditorProvider initialKit={kit}>
      <KitEditorWorkspace kitId={kitId} stageErrors={stageErrors} />
    </KitEditorProvider>
  );
}

'use client';

// ============================================================================
// Kit Editor Context & Reducer
// ============================================================================

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

export type QuestionCategory = 'technical' | 'behavioural' | 'system_design' | 'company_fit';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface QuestionItem {
  id: string;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  prompt: string;
  answer_outline: string;
  criteria?: string[];
  rubric?: Array<{ score: number; description: string }>;
  why_asked?: string;
  target_role?: string;
  matched_requirements?: string[];
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  tags?: string[];
  category?: string;
}

export interface CompanyBrief {
  summary: string;
  what_they_do: string;
  business_model?: string;
  engineering_culture?: string;
  recent_news?: string[];
  interview_process?: string[];
}

export interface ScheduleDay {
  day: number;
  focus: string;
  minutes: number;
  question_ids: string[];
}

export interface KitData {
  _id: string;
  id?: string;
  userId: string;
  status: 'draft' | 'generating' | 'ready' | 'partial' | 'failed';
  version: number;
  source: {
    company: string;
    company_url?: string;
    researched_at?: string;
  };
  role: {
    title: string;
    seniority?: string;
    responsibilities?: string[];
    requirements?: Array<{ id: string; text: string; priority: string; kind: string }>;
  };
  company_brief: CompanyBrief;
  questions: QuestionItem[];
  flashcards: FlashcardItem[];
  schedule: {
    days_available: number;
    days: ScheduleDay[];
  };
  coverage?: {
    uncovered_requirement_ids: string[];
    passes: number;
    gaps?: Array<{ requirement_id: string; reason: string }>;
  };
  editState?: {
    pinnedItems: string[];
  };
  originalDays?: number;
  originalJd?: string;
  originalCompanyUrl?: string;
  generationJobId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type EditorAction =
  | { type: 'INIT_KIT'; payload: KitData }
  | { type: 'UPDATE_QUESTION'; payload: { id: string; updates: Partial<QuestionItem> } }
  | { type: 'ADD_QUESTION'; payload: { question: QuestionItem } }
  | { type: 'DELETE_QUESTION'; payload: { id: string } }
  | { type: 'REORDER_QUESTIONS'; payload: { category: QuestionCategory; questions: QuestionItem[] } }
  | { type: 'MOVE_QUESTION_CATEGORY'; payload: { id: string; newCategory: QuestionCategory } }
  | { type: 'UPDATE_FLASHCARD'; payload: { id: string; updates: Partial<FlashcardItem> } }
  | { type: 'ADD_FLASHCARD'; payload: { flashcard: FlashcardItem } }
  | { type: 'DELETE_FLASHCARD'; payload: { id: string } }
  | { type: 'UPDATE_BRIEF'; payload: { updates: Partial<CompanyBrief> } }
  | { type: 'PIN_ITEM'; payload: { id: string } }
  | { type: 'UNPIN_ITEM'; payload: { id: string } }
  | { type: 'APPLY_REGENERATED_SECTION'; payload: { section: string; incomingKit: Partial<KitData> } }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SAVE_SUCCESS'; payload: { newVersion: number } }
  | { type: 'SAVE_CONFLICT'; payload: { currentVersion: number } }
  | { type: 'SAVE_ERROR'; payload: string }
  | { type: 'SET_REGENERATING'; payload: { section: string; isRegenerating: boolean; error?: string } };

interface KitEditorState {
  kit: KitData;
  pinnedIds: Set<string>;
  isDirty: boolean;
  isSaving: boolean;
  savingStatus: 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
  saveError: string | null;
  conflictError: boolean;
  regeneratingSections: Set<string>;
  sectionErrors: Record<string, string>;
}

function editorReducer(state: KitEditorState, action: EditorAction): KitEditorState {
  switch (action.type) {
    case 'INIT_KIT': {
      const initialPinned = new Set<string>(action.payload.editState?.pinnedItems || []);
      return {
        kit: action.payload,
        pinnedIds: initialPinned,
        isDirty: false,
        isSaving: false,
        savingStatus: 'idle',
        saveError: null,
        conflictError: false,
        regeneratingSections: new Set<string>(),
        sectionErrors: {},
      };
    }

    case 'UPDATE_QUESTION': {
      const { id, updates } = action.payload;
      const updatedQuestions = state.kit.questions.map((q) =>
        q.id === id ? { ...q, ...updates } : q
      );
      const newPinned = new Set(state.pinnedIds);
      newPinned.add(id); // Automatic pinning on edit

      return {
        ...state,
        kit: { ...state.kit, questions: updatedQuestions },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'ADD_QUESTION': {
      const { question } = action.payload;
      const newPinned = new Set(state.pinnedIds);
      newPinned.add(question.id);

      return {
        ...state,
        kit: { ...state.kit, questions: [...state.kit.questions, question] },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'DELETE_QUESTION': {
      const { id } = action.payload;
      const updatedQuestions = state.kit.questions.filter((q) => q.id !== id);
      const newPinned = new Set(state.pinnedIds);
      newPinned.delete(id);

      // Also clean up question_ids from schedule days
      const updatedScheduleDays = (state.kit.schedule?.days || []).map((day) => ({
        ...day,
        question_ids: day.question_ids.filter((qid) => qid !== id),
      }));

      return {
        ...state,
        kit: {
          ...state.kit,
          questions: updatedQuestions,
          schedule: {
            ...state.kit.schedule,
            days: updatedScheduleDays,
          },
        },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'REORDER_QUESTIONS': {
      const { category, questions: reorderedForCategory } = action.payload;
      // Preserve questions not in this category in their existing relative order
      const nonCategoryQuestions = state.kit.questions.filter((q) => q.category !== category);
      const combined = [...nonCategoryQuestions, ...reorderedForCategory];

      return {
        ...state,
        kit: { ...state.kit, questions: combined },
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'MOVE_QUESTION_CATEGORY': {
      const { id, newCategory } = action.payload;
      const updatedQuestions = state.kit.questions.map((q) =>
        q.id === id ? { ...q, category: newCategory } : q
      );
      const newPinned = new Set(state.pinnedIds);
      newPinned.add(id);

      return {
        ...state,
        kit: { ...state.kit, questions: updatedQuestions },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'UPDATE_FLASHCARD': {
      const { id, updates } = action.payload;
      const updatedCards = state.kit.flashcards.map((fc) =>
        fc.id === id ? { ...fc, ...updates } : fc
      );
      const newPinned = new Set(state.pinnedIds);
      newPinned.add(id);

      return {
        ...state,
        kit: { ...state.kit, flashcards: updatedCards },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'ADD_FLASHCARD': {
      const { flashcard } = action.payload;
      const newPinned = new Set(state.pinnedIds);
      newPinned.add(flashcard.id);

      return {
        ...state,
        kit: { ...state.kit, flashcards: [...state.kit.flashcards, flashcard] },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'DELETE_FLASHCARD': {
      const { id } = action.payload;
      const updatedCards = state.kit.flashcards.filter((fc) => fc.id !== id);
      const newPinned = new Set(state.pinnedIds);
      newPinned.delete(id);

      return {
        ...state,
        kit: { ...state.kit, flashcards: updatedCards },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'UPDATE_BRIEF': {
      const { updates } = action.payload;
      const newPinned = new Set(state.pinnedIds);
      newPinned.add('company_brief');

      return {
        ...state,
        kit: {
          ...state.kit,
          company_brief: { ...state.kit.company_brief, ...updates },
        },
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'PIN_ITEM': {
      const { id } = action.payload;
      const newPinned = new Set(state.pinnedIds);
      newPinned.add(id);
      return {
        ...state,
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'UNPIN_ITEM': {
      const { id } = action.payload;
      const newPinned = new Set(state.pinnedIds);
      newPinned.delete(id);
      return {
        ...state,
        pinnedIds: newPinned,
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    // CRITICAL: Stable ID Matching for Pinned Items (Never Position-based)
    case 'APPLY_REGENERATED_SECTION': {
      const { section, incomingKit } = action.payload;
      const pinned = state.pinnedIds;
      let nextQuestions = [...state.kit.questions];
      let nextFlashcards = [...state.kit.flashcards];
      let nextBrief = { ...state.kit.company_brief };
      let nextSchedule = { ...state.kit.schedule };

      if (section === 'company_brief') {
        // If company_brief was pinned by user, do NOT clobber user's edits
        if (!pinned.has('company_brief') && incomingKit.company_brief) {
          nextBrief = incomingKit.company_brief;
        }
      } else if (section === 'flashcards') {
        if (incomingKit.flashcards) {
          // Keep every flashcard whose stable ID is in pinnedIds
          const pinnedFlashcards = state.kit.flashcards.filter((fc) => pinned.has(fc.id));
          const pinnedIdsInFc = new Set(pinnedFlashcards.map((fc) => fc.id));

          // Newly incoming non-pinned flashcards
          const newNonPinned = incomingKit.flashcards.filter((fc) => !pinnedIdsInFc.has(fc.id));

          // Result: preserved pinned items + incoming non-pinned items
          nextFlashcards = [...pinnedFlashcards, ...newNonPinned];
        }
      } else if (section.startsWith('questions') || section === 'questions') {
        if (incomingKit.questions) {
          const isCategorySpecific = section.startsWith('questions_');
          const targetCategory = isCategorySpecific
            ? (section.replace('questions_', '') as QuestionCategory)
            : null;

          if (targetCategory) {
            // Regeneration was for a specific category
            // 1. Keep all questions from OTHER categories untouched
            const otherCategoryQuestions = state.kit.questions.filter(
              (q) => q.category !== targetCategory
            );

            // 2. In the target category, keep any question whose stable ID is in pinnedIds
            const pinnedInTarget = state.kit.questions.filter(
              (q) => q.category === targetCategory && pinned.has(q.id)
            );
            const pinnedTargetIds = new Set(pinnedInTarget.map((q) => q.id));

            // 3. Take newly generated questions from incomingKit for this category (excluding any collision)
            const incomingForTarget = incomingKit.questions.filter(
              (q) => (q.category === targetCategory || !targetCategory) && !pinnedTargetIds.has(q.id)
            );

            nextQuestions = [...otherCategoryQuestions, ...pinnedInTarget, ...incomingForTarget];
          } else {
            // Full questions regeneration
            const allPinned = state.kit.questions.filter((q) => pinned.has(q.id));
            const allPinnedIds = new Set(allPinned.map((q) => q.id));
            const incomingNonPinned = incomingKit.questions.filter((q) => !allPinnedIds.has(q.id));

            nextQuestions = [...allPinned, ...incomingNonPinned];
          }
        }
      } else if (section === 'schedule') {
        if (incomingKit.schedule) {
          nextSchedule = incomingKit.schedule;
        }
      }

      return {
        ...state,
        kit: {
          ...state.kit,
          company_brief: nextBrief,
          questions: nextQuestions,
          flashcards: nextFlashcards,
          schedule: nextSchedule,
        },
        isDirty: true,
        savingStatus: 'idle',
      };
    }

    case 'SET_SAVING': {
      return {
        ...state,
        isSaving: action.payload,
        savingStatus: action.payload ? 'saving' : state.savingStatus,
      };
    }

    case 'SAVE_SUCCESS': {
      return {
        ...state,
        kit: {
          ...state.kit,
          version: action.payload.newVersion,
          editState: { pinnedItems: Array.from(state.pinnedIds) },
        },
        isDirty: false,
        isSaving: false,
        savingStatus: 'saved',
        saveError: null,
        conflictError: false,
      };
    }

    case 'SAVE_CONFLICT': {
      return {
        ...state,
        isSaving: false,
        savingStatus: 'conflict',
        conflictError: true,
        saveError: 'Kit was updated elsewhere, reloading...',
      };
    }

    case 'SAVE_ERROR': {
      return {
        ...state,
        isSaving: false,
        savingStatus: 'error',
        saveError: action.payload,
      };
    }

    case 'SET_REGENERATING': {
      const { section, isRegenerating, error } = action.payload;
      const nextRegen = new Set<string>(state.regeneratingSections);
      const nextErrors = { ...state.sectionErrors };

      if (isRegenerating) {
        nextRegen.add(section);
        delete nextErrors[section];
      } else {
        nextRegen.delete(section);
        if (error) {
          nextErrors[section] = error;
        } else {
          delete nextErrors[section];
        }
      }

      return {
        ...state,
        regeneratingSections: nextRegen,
        sectionErrors: nextErrors,
      };
    }

    default:
      return state;
  }
}

// ---- Context Interface -----------------------------------------------------

interface KitEditorContextValue {
  kit: KitData;
  pinnedIds: Set<string>;
  isDirty: boolean;
  isSaving: boolean;
  savingStatus: 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
  saveError: string | null;
  conflictError: boolean;
  regeneratingSections: Set<string>;
  sectionErrors: Record<string, string>;

  // Pin helpers
  isPinned: (id: string) => boolean;
  pin: (id: string) => void;
  unpin: (id: string) => void;

  // Actions
  updateQuestion: (id: string, updates: Partial<QuestionItem>) => void;
  addQuestion: (question: Omit<QuestionItem, 'id'>) => string;
  deleteQuestion: (id: string) => void;
  reorderQuestions: (category: QuestionCategory, questions: QuestionItem[]) => void;
  moveQuestionCategory: (id: string, newCategory: QuestionCategory) => void;

  updateFlashcard: (id: string, updates: Partial<FlashcardItem>) => void;
  addFlashcard: (flashcard: Omit<FlashcardItem, 'id'>) => string;
  deleteFlashcard: (id: string) => void;

  updateBrief: (updates: Partial<CompanyBrief>) => void;

  // Save & Regenerate
  saveNow: () => Promise<void>;
  regenerateSection: (section: string) => Promise<void>;
  reloadLatestKit: () => Promise<void>;
}

const KitEditorContext = createContext<KitEditorContextValue | undefined>(undefined);

export function KitEditorProvider({
  initialKit,
  children,
}: {
  initialKit: KitData;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(editorReducer, {
    kit: initialKit,
    pinnedIds: new Set<string>(initialKit.editState?.pinnedItems || []),
    isDirty: false,
    isSaving: false,
    savingStatus: 'idle',
    saveError: null,
    conflictError: false,
    regeneratingSections: new Set<string>(),
    sectionErrors: {},
  });

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Sync document title with dirty dot indicator: • Kit Title
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const baseTitle = `${state.kit.role?.title || 'Interview Kit'} | PrepForge`;
    document.title = state.isDirty ? `• ${baseTitle}` : baseTitle;
  }, [state.isDirty, state.kit.role?.title]);

  // Execute Save API Call
  const performSave = useCallback(async () => {
    const currentState = stateRef.current;
    if (!currentState.isDirty) return;

    dispatch({ type: 'SET_SAVING', payload: true });

    try {
      const kitId = currentState.kit._id || currentState.kit.id;
      const res = await api.put<{ kit: KitData }>(`/api/kits/${kitId}`, {
        version: currentState.kit.version,
        company_brief: currentState.kit.company_brief,
        role: currentState.kit.role,
        questions: currentState.kit.questions,
        flashcards: currentState.kit.flashcards,
        schedule: currentState.kit.schedule,
        coverage: currentState.kit.coverage,
        editState: { pinnedItems: Array.from(currentState.pinnedIds) },
      });

      dispatch({
        type: 'SAVE_SUCCESS',
        payload: { newVersion: res.kit.version },
      });

      // Clear "Saved" indicator after 2s
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        // Will settle back to idle
      }, 2000);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        dispatch({
          type: 'SAVE_CONFLICT',
          payload: { currentVersion: err.details?.currentVersion || 0 },
        });
        // Auto-reload after conflict
        setTimeout(async () => {
          await reloadLatestKit();
        }, 1500);
      } else {
        dispatch({
          type: 'SAVE_ERROR',
          payload: err.message || 'Auto-save failed',
        });
      }
    }
  }, []);

  // Debounced Auto-Save (2s delay after any modification)
  useEffect(() => {
    if (!state.isDirty) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      performSave();
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [state.isDirty, performSave]);

  // Reload latest kit from backend
  const reloadLatestKit = useCallback(async () => {
    try {
      const kitId = stateRef.current.kit._id || stateRef.current.kit.id;
      const res = await api.get<{ kit: KitData }>(`/api/kits/${kitId}`);
      dispatch({ type: 'INIT_KIT', payload: res.kit });
    } catch (err: any) {
      console.error('Failed to reload kit after conflict:', err);
    }
  }, []);

  // Section Regeneration Flow
  const regenerateSection = useCallback(async (section: string) => {
    const currentState = stateRef.current;
    const kitId = currentState.kit._id || currentState.kit.id;
    const pinnedList = Array.from(currentState.pinnedIds);

    dispatch({
      type: 'SET_REGENERATING',
      payload: { section, isRegenerating: true },
    });

    try {
      const res = await api.post<{ jobId: string; message: string }>(
        `/api/kits/${kitId}/regenerate`,
        {
          section,
          pinnedItemIds: pinnedList,
          pinnedIds: pinnedList,
        }
      );

      const jobId = res.jobId;

      // Poll generation job until complete
      const pollJob = async (): Promise<KitData> => {
        while (true) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const jobRes = await api.get<any>(`/api/generation/${jobId}`);
            if (['completed', 'partial'].includes(jobRes.status)) {
              // Fetch latest kit
              const updatedKitRes = await api.get<{ kit: KitData }>(`/api/kits/${kitId}`);
              return updatedKitRes.kit;
            } else if (jobRes.status === 'failed') {
              throw new Error(jobRes.error?.message || 'Section regeneration failed');
            }
          } catch (pollErr: any) {
            if (pollErr.message && pollErr.message.includes('failed')) {
              throw pollErr;
            }
            // continue polling
          }
        }
      };

      const updatedKit = await pollJob();

      // Apply incoming section data with stable-ID matching
      dispatch({
        type: 'APPLY_REGENERATED_SECTION',
        payload: { section, incomingKit: updatedKit },
      });

      dispatch({
        type: 'SET_REGENERATING',
        payload: { section, isRegenerating: false },
      });
    } catch (err: any) {
      dispatch({
        type: 'SET_REGENERATING',
        payload: {
          section,
          isRegenerating: false,
          error: err.message || 'Regeneration failed. Click to retry.',
        },
      });
    }
  }, []);

  // Helpers
  const isPinned = useCallback((id: string) => state.pinnedIds.has(id), [state.pinnedIds]);
  const pin = useCallback((id: string) => dispatch({ type: 'PIN_ITEM', payload: { id } }), []);
  const unpin = useCallback((id: string) => dispatch({ type: 'UNPIN_ITEM', payload: { id } }), []);

  const updateQuestion = useCallback(
    (id: string, updates: Partial<QuestionItem>) =>
      dispatch({ type: 'UPDATE_QUESTION', payload: { id, updates } }),
    []
  );

  const addQuestion = useCallback(
    (questionData: Omit<QuestionItem, 'id'>): string => {
      const newId = `user-q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const fullQuestion: QuestionItem = { ...questionData, id: newId };
      dispatch({ type: 'ADD_QUESTION', payload: { question: fullQuestion } });
      return newId;
    },
    []
  );

  const deleteQuestion = useCallback(
    (id: string) => dispatch({ type: 'DELETE_QUESTION', payload: { id } }),
    []
  );

  const reorderQuestions = useCallback(
    (category: QuestionCategory, questions: QuestionItem[]) =>
      dispatch({ type: 'REORDER_QUESTIONS', payload: { category, questions } }),
    []
  );

  const moveQuestionCategory = useCallback(
    (id: string, newCategory: QuestionCategory) =>
      dispatch({ type: 'MOVE_QUESTION_CATEGORY', payload: { id, newCategory } }),
    []
  );

  const updateFlashcard = useCallback(
    (id: string, updates: Partial<FlashcardItem>) =>
      dispatch({ type: 'UPDATE_FLASHCARD', payload: { id, updates } }),
    []
  );

  const addFlashcard = useCallback(
    (flashcardData: Omit<FlashcardItem, 'id'>): string => {
      const newId = `user-fc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const fullCard: FlashcardItem = { ...flashcardData, id: newId };
      dispatch({ type: 'ADD_FLASHCARD', payload: { flashcard: fullCard } });
      return newId;
    },
    []
  );

  const deleteFlashcard = useCallback(
    (id: string) => dispatch({ type: 'DELETE_FLASHCARD', payload: { id } }),
    []
  );

  const updateBrief = useCallback(
    (updates: Partial<CompanyBrief>) => dispatch({ type: 'UPDATE_BRIEF', payload: { updates } }),
    []
  );

  const contextValue: KitEditorContextValue = {
    kit: state.kit,
    pinnedIds: state.pinnedIds,
    isDirty: state.isDirty,
    isSaving: state.isSaving,
    savingStatus: state.savingStatus,
    saveError: state.saveError,
    conflictError: state.conflictError,
    regeneratingSections: state.regeneratingSections,
    sectionErrors: state.sectionErrors,

    isPinned,
    pin,
    unpin,

    updateQuestion,
    addQuestion,
    deleteQuestion,
    reorderQuestions,
    moveQuestionCategory,

    updateFlashcard,
    addFlashcard,
    deleteFlashcard,

    updateBrief,

    saveNow: performSave,
    regenerateSection,
    reloadLatestKit,
  };

  return (
    <KitEditorContext.Provider value={contextValue}>{children}</KitEditorContext.Provider>
  );
}

export function useKitEditor() {
  const context = useContext(KitEditorContext);
  if (!context) {
    throw new Error('useKitEditor must be used within a KitEditorProvider');
  }
  return context;
}

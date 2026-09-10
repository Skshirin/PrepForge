'use client';

// ============================================================================
// Dashboard Page (/dashboard)
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';

export interface KitSummary {
  id: string;
  status: 'draft' | 'generating' | 'ready' | 'failed' | 'partial';
  company: string;
  companyUrl: string;
  roleTitle: string;
  days: number;
  version: number;
  generationJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [kits, setKits] = useState<KitSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deletion modal state
  const [kitToDelete, setKitToDelete] = useState<KitSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auth protection
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace('/login?redirect=/dashboard');
    }
  }, [user, isAuthLoading, router]);

  const loadKits = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ kits: KitSummary[] }>('/api/kits');
      setKits(res.kits || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load interview kits.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadKits();
    }
  }, [user, loadKits]);

  const handleDelete = async () => {
    if (!kitToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/kits/${kitToDelete.id}`);
      setKits((prev) => prev.filter((k) => k.id !== kitToDelete.id));
      setKitToDelete(null);
    } catch (err: any) {
      alert(`Could not delete kit: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
            Ready
          </span>
        );
      case 'generating':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1.5 animate-ping" />
            Generating
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
            Partial Research
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            Draft
          </span>
        );
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Page Header */}
      <div className="sm:flex sm:items-center sm:justify-between mb-8 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Interview Kits
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your personalized AI preparation kits and schedules
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/kits/new"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-md shadow-indigo-600/20 transition-all duration-150"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create new kit
          </Link>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => loadKits()}
            className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-lg text-xs transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-slate-900/40 border border-slate-800/60 p-6 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-5 bg-slate-800 rounded w-3/4" />
                <div className="h-4 bg-slate-800/60 rounded w-1/2" />
              </div>
              <div className="h-4 bg-slate-800/40 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : kits.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 text-indigo-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">No kits yet</h3>
          <p className="mt-1 text-sm text-slate-400 max-w-sm mx-auto">
            Input a job description and company URL to generate a comprehensive interview prep kit.
          </p>
          <div className="mt-6">
            <Link
              href="/kits/new"
              className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create your first kit
            </Link>
          </div>
        </div>
      ) : (
        /* Kits Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kits.map((kit) => (
            <div
              key={kit.id}
              className="group bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between hover:shadow-xl hover:shadow-indigo-950/20"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-xs font-medium text-slate-400 tracking-wide uppercase">
                    {kit.days}-Day Plan
                  </span>
                  {getStatusBadge(kit.status)}
                </div>

                <Link
                  href={`/kits/${kit.id}`}
                  className="block group-hover:text-indigo-300 transition-colors"
                >
                  <h2 className="text-lg font-semibold text-white leading-snug line-clamp-2">
                    {kit.roleTitle || 'Interview Preparation Kit'}
                  </h2>
                </Link>

                <p className="mt-1 text-sm text-slate-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="truncate">{kit.company || 'Unknown Company'}</span>
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {kit.createdAt ? new Date(kit.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }) : ''}
                </span>

                <div className="flex items-center space-x-2">
                  <Link
                    href={`/kits/${kit.id}`}
                    className="px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-white bg-indigo-950/40 hover:bg-indigo-600/80 border border-indigo-800/40 rounded-lg transition-colors"
                  >
                    {kit.status === 'generating' ? 'View Progress' : 'Open Kit'}
                  </Link>
                  <button
                    onClick={() => setKitToDelete(kit)}
                    title="Delete kit"
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {kitToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Delete interview kit?</h3>
            </div>

            <p className="text-sm text-slate-300">
              Are you sure you want to delete the kit for{' '}
              <span className="font-semibold text-white">{kitToDelete.roleTitle || 'this role'}</span> at{' '}
              <span className="font-semibold text-white">{kitToDelete.company || 'Company'}</span>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setKitToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 transition disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

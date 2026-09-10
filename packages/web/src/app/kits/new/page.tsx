'use client';

// ============================================================================
// New Interview Kit Creation Page (/kits/new)
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';

export default function NewKitPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  // Mode: single form or bulk upload
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // Single kit form state
  const [jd, setJd] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [days, setDays] = useState<number>(5);
  const [roleTitle, setRoleTitle] = useState('');

  // Bulk upload state
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkEntries, setBulkEntries] = useState<Array<{ jd: string; company_url?: string; days?: number }>>([]);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  // Errors & loading
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth protection
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace('/login?redirect=/kits/new');
    }
  }, [user, isAuthLoading, router]);

  // Validate single kit form
  const validateSingle = (): boolean => {
    const errors: Record<string, string> = {};

    if (!jd.trim() || jd.trim().length < 10) {
      errors.jd = 'Job description must be at least 10 characters.';
    }

    if (companyUrl.trim()) {
      try {
        const u = new URL(companyUrl.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          errors.companyUrl = 'URL must start with http:// or https://';
        }
      } catch {
        errors.companyUrl = 'Please enter a valid website URL (e.g. https://company.com).';
      }
    }

    if (!days || days < 1 || days > 60 || !Number.isInteger(Number(days))) {
      errors.days = 'Days available must be an integer between 1 and 60.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validateSingle()) return;

    setIsSubmitting(true);
    try {
      const res = await api.post<{ kitId: string; jobId: string }>('/api/kits', {
        jd: jd.trim(),
        companyUrl: companyUrl.trim(),
        days: Number(days),
        roleTitle: roleTitle.trim() || undefined,
      });

      // Redirect to kit progress/detail view
      router.push(`/kits/${res.kitId}`);
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to trigger kit generation.');
      setIsSubmitting(false);
    }
  };

  // Parse bulk JSON or CSV
  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGeneralError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkFile(file);
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (!Array.isArray(parsed)) {
            throw new Error('JSON file must contain an array of objects.');
          }
          setBulkEntries(parsed);
        } else if (file.name.endsWith('.csv')) {
          // Parse CSV: headers jd,company_url,days
          const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length < 2) {
            throw new Error('CSV must contain a header line and at least one entry.');
          }
          const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
          const jdIdx = headers.indexOf('jd');
          const compIdx = headers.indexOf('company_url');
          const daysIdx = headers.indexOf('days');

          if (jdIdx === -1) {
            throw new Error('CSV must have a "jd" column header.');
          }

          const parsedEntries = lines.slice(1).map((line) => {
            const cols = line.split(',');
            return {
              jd: cols[jdIdx] || '',
              company_url: compIdx !== -1 ? cols[compIdx] : '',
              days: daysIdx !== -1 ? parseInt(cols[daysIdx], 10) || 5 : 5,
            };
          });

          setBulkEntries(parsedEntries);
        } else {
          throw new Error('Unsupported file format. Please upload a .json or .csv file.');
        }
      } catch (err: any) {
        setGeneralError(err.message || 'Failed to parse bulk file.');
        setBulkEntries([]);
      }
    };

    reader.readAsText(file);
  };

  const handleBulkSubmit = async () => {
    if (bulkEntries.length === 0) {
      setGeneralError('Please upload a valid JSON or CSV file with at least one kit entry.');
      return;
    }

    setIsSubmitting(true);
    setGeneralError(null);
    let createdFirstId: string | null = null;

    try {
      for (let i = 0; i < bulkEntries.length; i++) {
        const item = bulkEntries[i];
        setBulkProgress(`Queuing kit ${i + 1} of ${bulkEntries.length}...`);

        const res = await api.post<{ kitId: string; jobId: string }>('/api/kits', {
          jd: item.jd,
          companyUrl: item.company_url || '',
          days: item.days || 5,
        });

        if (i === 0) {
          createdFirstId = res.kitId;
        }
      }

      // If single item uploaded via bulk, go to it; otherwise go to dashboard
      if (bulkEntries.length === 1 && createdFirstId) {
        router.push(`/kits/${createdFirstId}`);
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Error occurred while submitting bulk jobs.');
      setIsSubmitting(false);
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Create Interview Kit
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Provide a job description to extract requirements and build your study curriculum
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="inline-flex rounded-xl bg-slate-900 border border-slate-800 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              mode === 'single'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Single Kit
          </button>
          <button
            type="button"
            onClick={() => setMode('bulk')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              mode === 'bulk'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bulk Upload (JSON/CSV)
          </button>
        </div>
      </div>

      {/* General Error Banner */}
      {generalError && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start space-x-2">
          <svg className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{generalError}</span>
        </div>
      )}

      {mode === 'single' ? (
        /* Single Kit Form */
        <form onSubmit={handleSingleSubmit} className="space-y-6" noValidate>
          {/* Job Description */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label htmlFor="jd" className="block text-sm font-medium text-slate-200">
                Job Description <span className="text-indigo-400">*</span>
              </label>
              <span className="text-xs text-slate-500">
                {jd.length} characters (no limit)
              </span>
            </div>
            <textarea
              id="jd"
              rows={8}
              required
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here (responsibilities, required qualifications, nice-to-haves)..."
              className={`w-full px-4 py-3 bg-slate-900/80 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed transition ${
                fieldErrors.jd ? 'border-rose-500/60 focus:ring-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.jd && (
              <p className="text-xs text-rose-400 mt-1">{fieldErrors.jd}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Company URL */}
            <div className="space-y-1.5">
              <label htmlFor="companyUrl" className="block text-sm font-medium text-slate-200">
                Company Website URL
              </label>
              <input
                id="companyUrl"
                type="url"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://acme.com"
                className={`w-full px-3.5 py-2.5 bg-slate-900/80 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition ${
                  fieldErrors.companyUrl ? 'border-rose-500/60 focus:ring-rose-500' : 'border-slate-800'
                }`}
              />
              <p className="text-xs text-slate-500">
                Used to research company culture, tech stack, and interview process.
              </p>
              {fieldErrors.companyUrl && (
                <p className="text-xs text-rose-400 mt-1">{fieldErrors.companyUrl}</p>
              )}
            </div>

            {/* Days Available */}
            <div className="space-y-1.5">
              <label htmlFor="days" className="block text-sm font-medium text-slate-200">
                Days Until Interview <span className="text-indigo-400">*</span>
              </label>
              <input
                id="days"
                type="number"
                min={1}
                max={60}
                required
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className={`w-full px-3.5 py-2.5 bg-slate-900/80 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition ${
                  fieldErrors.days ? 'border-rose-500/60 focus:ring-rose-500' : 'border-slate-800'
                }`}
              />
              <p className="text-xs text-slate-500">
                Preparation timeline (1 to 60 days). Your study schedule will allocate daily minutes.
              </p>
              {fieldErrors.days && (
                <p className="text-xs text-rose-400 mt-1">{fieldErrors.days}</p>
              )}
            </div>
          </div>

          {/* Optional Role Title Override */}
          <div className="space-y-1.5">
            <label htmlFor="roleTitle" className="block text-sm font-medium text-slate-200">
              Role Title <span className="text-xs text-slate-500">(Optional — auto-extracted if blank)</span>
            </label>
            <input
              id="roleTitle"
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-4 flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition flex items-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Starting generation...</span>
                </>
              ) : (
                <span>Generate Interview Kit</span>
              )}
            </button>
          </div>
        </form>
      ) : (
        /* Bulk Upload Mode */
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                Upload batch input file
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Accepts <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">.json</code> matching Appendix B or <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">.csv</code> (headers: <code className="text-slate-300">jd,company_url,days</code>)
              </p>
            </div>

            <input
              type="file"
              accept=".json,.csv"
              onChange={handleBulkFileChange}
              id="bulk-upload-input"
              className="hidden"
            />
            <label
              htmlFor="bulk-upload-input"
              className="inline-flex items-center px-4 py-2 text-xs font-medium rounded-lg text-white bg-slate-800 hover:bg-slate-700 cursor-pointer transition"
            >
              Browse file
            </label>

            {bulkFile && (
              <div className="mt-2 text-xs text-slate-300 flex items-center justify-center space-x-2">
                <span>Selected: <strong>{bulkFile.name}</strong></span>
                <span className="text-emerald-400">({bulkEntries.length} entries parsed)</span>
              </div>
            )}
          </div>

          {bulkEntries.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 max-h-60 overflow-y-auto space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Preview ({bulkEntries.length} kits)
              </p>
              {bulkEntries.slice(0, 5).map((entry, idx) => (
                <div key={idx} className="text-xs p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 flex items-center justify-between">
                  <span className="truncate max-w-[300px] text-slate-300 font-mono">
                    {entry.jd.slice(0, 80)}...
                  </span>
                  <div className="flex items-center space-x-3 text-slate-400">
                    <span>{entry.company_url || 'No URL'}</span>
                    <span className="font-semibold text-indigo-400">{entry.days || 5}d</span>
                  </div>
                </div>
              ))}
              {bulkEntries.length > 5 && (
                <p className="text-xs text-center text-slate-500">
                  + {bulkEntries.length - 5} more entries
                </p>
              )}
            </div>
          )}

          <div className="pt-4 flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkSubmit}
              disabled={isSubmitting || bulkEntries.length === 0}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition flex items-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{bulkProgress || 'Processing batch...'}</span>
                </>
              ) : (
                <span>Queue {bulkEntries.length} Kits</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

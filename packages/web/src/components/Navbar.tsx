'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Hide nav on auth pages
  if (pathname === '/login' || pathname === '/register') {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          href="/dashboard"
          className="flex items-center space-x-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg p-1"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <span className="font-semibold text-lg text-white tracking-tight">
            PrepForge <span className="text-indigo-400 font-normal">AI</span>
          </span>
        </Link>

        {/* Navigation / Actions */}
        {user ? (
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-sm text-slate-400">
              <span className="truncate max-w-[180px]">{user.email}</span>
            </div>

            <button
              onClick={() => logout()}
              className="text-sm text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-4 py-1.5 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

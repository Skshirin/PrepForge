'use client';

// ============================================================================
// Auth Context & Provider
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, ApiError, getStoredToken, setStoredToken } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const authSequenceRef = useRef(0);

  const checkAuth = useCallback(async () => {
    const seq = ++authSequenceRef.current;
    try {
      const res = await api.get<{ user: AuthUser }>('/api/auth/me');
      if (seq === authSequenceRef.current) {
        setUser(res.user);
      }
    } catch {
      if (seq === authSequenceRef.current) {
        setStoredToken(null);
        setUser(null);
      }
    } finally {
      if (seq === authSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    authSequenceRef.current++; // Invalidate any in-flight checkAuth
    const res = await api.post<{ user: AuthUser; token?: string }>('/api/auth/login', { email, password });
    if (res.token) {
      setStoredToken(res.token);
    }
    setUser(res.user);
    setIsLoading(false);
    return res.user;
  };

  const register = async (email: string, password: string): Promise<AuthUser> => {
    authSequenceRef.current++; // Invalidate any in-flight checkAuth
    const res = await api.post<{ user: AuthUser; token?: string }>('/api/auth/register', { email, password });
    if (res.token) {
      setStoredToken(res.token);
    }
    setUser(res.user);
    setIsLoading(false);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    authSequenceRef.current++;
    setStoredToken(null);
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Ignore logout errors
    } finally {
      setUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refreshUser: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

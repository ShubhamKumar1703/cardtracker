'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';

export default function AuthPage({ isSignUp = false }: { isSignUp?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          action: isSignUp ? 'signup' : 'login',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.user?.id) {
        // Save current active user ID to localStorage for client-side state
        localStorage.setItem('cardtracker_user_id', data.user.id);
        localStorage.setItem('cardtracker_user_email', data.user.email);
      }

      router.push('/');
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 mx-auto flex items-center justify-center font-black text-black text-xl shadow-xl shadow-emerald-500/20">
            ₹
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">
            {isSignUp ? 'Create your Account' : 'Welcome to CardTracker'}
          </h1>
          <p className="text-xs text-zinc-400">
            Real-time engine for Kiwi RuPay, Axis Neo & UPI
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 bg-zinc-900/60 p-5 rounded-3xl border border-zinc-800 shadow-xl">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-bold text-black text-sm transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="text-center pt-2 text-xs text-zinc-400">
            {isSignUp ? (
              <span>
                Already have an account?{' '}
                <Link href="/login" className="text-emerald-400 hover:underline font-semibold">
                  Log in
                </Link>
              </span>
            ) : (
              <span>
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="text-emerald-400 hover:underline font-semibold">
                  Sign up
                </Link>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

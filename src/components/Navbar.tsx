'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Inbox, Plus } from 'lucide-react';

interface NavbarProps {
  onOpenAddModal: () => void;
  pendingCount?: number;
}

export function Navbar({ onOpenAddModal, pendingCount = 0 }: NavbarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-black text-base shadow-lg shadow-emerald-500/20">
            ₹
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight text-zinc-100 block leading-tight">
              CardTracker
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              Kiwi • Axis Neo • UPI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className={`relative p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
              pathname === '/inbox'
                ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span className="hidden sm:inline">Inbox</span>
            {pendingCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
                {pendingCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Global Floating Action Button (FAB) */}
      <button
        data-testid="fab-add-btn"
        onClick={onOpenAddModal}
        aria-label="Add transaction"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-400 text-black shadow-2xl shadow-emerald-500/40 active:scale-95 transition-transform"
      >
        <Plus className="w-7 h-7 stroke-[2.5]" />
      </button>

      {/* Bottom Nav for Mobile */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/80 py-2 px-6 flex justify-around items-center">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition ${
            pathname === '/' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          Dashboard
        </Link>
        <Link
          href="/inbox"
          className={`flex flex-col items-center gap-1 text-[11px] font-medium relative transition ${
            pathname === '/inbox' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Inbox className="w-5 h-5" />
          Inbox
          {pendingCount > 0 && (
            <span className="absolute -top-1 right-2 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-zinc-950" />
          )}
        </Link>
      </nav>
    </>
  );
}

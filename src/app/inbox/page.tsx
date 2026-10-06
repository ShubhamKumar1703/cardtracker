'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Inbox,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  HelpCircle,
  ExternalLink,
  Check
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { AddTransactionModal } from '@/components/AddTransactionModal';
import { CategoryIcon } from '@/components/CategoryIcon';
import { formatINR } from '@/lib/utils';
import { Category, PaymentInstrument, Transaction } from '@/types/database';

export default function InboxPage() {
  const [userId, setUserId] = useState<string>('00000000-0000-0000-0000-000000000001');
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [instruments, setInstruments] = useState<PaymentInstrument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);

  // Prompt state for "Always categorize [Merchant] as [Category]?"
  const [rulePrompt, setRulePrompt] = useState<{
    txId: string;
    merchantRaw: string;
    normalizedName: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const [txRes, metaRes] = await Promise.all([
        fetch(`/api/transactions?userId=${userId}&status=PENDING_REVIEW`),
        fetch(`/api/metadata?userId=${userId}`),
      ]);

      if (txRes.ok) {
        const json = await txRes.json();
        setPendingTxs(json.transactions || []);
      }
      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        setCategories(metaJson.categories || []);
        setInstruments(metaJson.instruments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedUserId = localStorage.getItem('cardtracker_user_id');
    if (savedUserId) {
      setUserId(savedUserId);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [userId]);

  // Single-tap category chips action
  const handleAssignCategory = async (tx: Transaction, category: Category) => {
    try {
      // 1. Instantly update status to CONFIRMED
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id,
          userId,
          category_id: category.id,
          status: 'CONFIRMED',
        }),
      });

      if (res.ok) {
        // Remove from pending list
        setPendingTxs(prev => prev.filter(t => t.id !== tx.id));

        // 2. Surface memory prompt: "Always categorize [Merchant] as [Category]?"
        setRulePrompt({
          txId: tx.id,
          merchantRaw: tx.merchant_raw,
          normalizedName: tx.merchant_normalized || tx.merchant_raw,
          categoryId: category.id,
          categoryName: category.name,
        });
      }
    } catch (err) {
      console.error('Failed to assign category:', err);
    }
  };

  // Confirm deterministic rule memory insertion
  const handleSaveRule = async (save: boolean) => {
    if (!rulePrompt) return;

    if (save) {
      try {
        await fetch('/api/transactions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: rulePrompt.txId,
            userId,
            saveRule: true,
            pattern: rulePrompt.normalizedName.toUpperCase(),
            category_id: rulePrompt.categoryId,
            normalized_name: rulePrompt.normalizedName,
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }

    setRulePrompt(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-28">
      <Navbar
        onOpenAddModal={() => setIsAddOpen(true)}
        pendingCount={pendingTxs.length}
      />

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Back Link & Title */}
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Inbox className="w-5 h-5 text-amber-400" />
              Review Inbox
            </h1>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20">
            {pendingTxs.length} pending
          </span>
        </div>

        {/* Rule confirmation banner */}
        {rulePrompt && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-zinc-900 border border-emerald-500/30 animate-in fade-in slide-in-from-top-2 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Smart Rule Memory
            </div>
            <p className="text-xs text-zinc-200">
              Always categorize <span className="font-bold text-white">&quot;{rulePrompt.normalizedName}&quot;</span> as{' '}
              <span className="font-bold text-emerald-300">&quot;{rulePrompt.categoryName}&quot;</span> in the future?
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                data-testid="save-rule-yes"
                onClick={() => handleSaveRule(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                Yes, Save Rule
              </button>
              <button
                data-testid="save-rule-no"
                onClick={() => handleSaveRule(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
              >
                No, Just This Once
              </button>
            </div>
          </div>
        )}

        {/* Inbox Transactions list */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-xs animate-pulse">
            Loading pending transactions...
          </div>
        ) : pendingTxs.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-sm text-zinc-200">Inbox Zero!</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              All bank alerts and transactions have been confirmed and categorized.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition"
            >
              Return to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTxs.map((tx) => (
              <div
                key={tx.id}
                className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3 hover:border-zinc-700 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-100">
                        {tx.merchant_raw}
                      </span>
                      {tx.is_potential_duplicate && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-950 text-red-300 border border-red-800 font-bold">
                          Potential duplicate of recent transaction
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                      <span>{tx.instrument?.display_name || tx.rail || 'Unspecified Rail'}</span>
                      <span>•</span>
                      <span>{new Date(tx.transaction_time).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {tx.bank_reference_id && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[10px]">Ref: {tx.bank_reference_id}</span>
                        </>
                      )}
                    </div>
                    {tx.notes && (
                      <p className="text-[11px] text-amber-400/90 mt-1 italic">
                        {tx.notes}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-base font-extrabold text-emerald-400">
                      {formatINR(Number(tx.amount))}
                    </span>
                  </div>
                </div>

                {/* Single-tap category chips */}
                <div>
                  <span className="text-[10px] font-semibold uppercase text-zinc-500 block mb-1.5">
                    Single-Tap Category Assignment
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        data-testid={`inbox-cat-${cat.slug}`}
                        onClick={() => handleAssignCategory(tx, cat)}
                        className="px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-emerald-500 hover:text-black active:scale-95 text-xs text-zinc-300 font-medium transition border border-zinc-700/50 flex items-center gap-1.5"
                      >
                        <CategoryIcon name={cat.icon} className="w-3.5 h-3.5" />
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AddTransactionModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        categories={categories}
        instruments={instruments}
        onAdded={fetchInbox}
        userId={userId}
      />
    </div>
  );
}

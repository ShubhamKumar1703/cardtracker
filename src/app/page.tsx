'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldAlert,
  CreditCard,
  Smartphone,
  CheckCircle,
  Sparkles,
  Layers,
  Calendar
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { AddTransactionModal } from '@/components/AddTransactionModal';
import { NotificationCenter } from '@/components/NotificationCenter';
import { CategoryIcon } from '@/components/CategoryIcon';
import { formatINR } from '@/lib/utils';
import { Category, PaymentInstrument, Transaction, InAppNotification } from '@/types/database';

export default function DashboardPage() {
  const [userId, setUserId] = useState<string>('00000000-0000-0000-0000-000000000001');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    netCurrentSpend: number;
    netPrevSpend: number;
    momChangePercent: number | null;
    overallBudget: number;
    pendingReviewCount: number;
    potentialDuplicatesCount: number;
    railSplit: Record<string, number>;
    instrumentBreakdown: { id: string; name: string; amount: number }[];
    categoryBreakdown: { id: string; name: string; slug: string; icon: string; budget: number | null; spent: number }[];
    recentTransactions: Transaction[];
  } | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [instruments, setInstruments] = useState<PaymentInstrument[]>([]);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Transaction[] | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // In-app notifications
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  // Register service worker for PWA and read current user from localStorage
  useEffect(() => {
    const savedUserId = localStorage.getItem('cardtracker_user_id');
    if (savedUserId) {
      setUserId(savedUserId);
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.log('ServiceWorker registration skipped:', err);
        });
      });
    }
  }, []);

  // Fetch Dashboard Analytics & Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [analyticsRes, metaRes] = await Promise.all([
        fetch(`/api/analytics?userId=${userId}`),
        fetch(`/api/metadata?userId=${userId}`),
      ]);

      if (analyticsRes.ok) {
        const json = await analyticsRes.json();
        setData(json);

        // Generate in-app notifications according to budget limits
        const newNotifs: InAppNotification[] = [];
        const budget = json.overallBudget || 35000;
        const spend = json.netCurrentSpend || 0;
        const pct = (spend / budget) * 100;

        if (pct >= 100) {
          newNotifs.push({
            id: 'budget-100',
            title: '100% Monthly Budget Reached',
            message: `You have spent ${formatINR(spend)}, exceeding your ₹${budget.toLocaleString()} monthly target limit!`,
            type: 'danger',
            date: 'Today',
            read: false,
          });
        } else if (pct >= 90) {
          newNotifs.push({
            id: 'budget-90',
            title: '90% Budget Alert Threshold',
            message: `You have reached 90% of your allocated budget (${formatINR(spend)} of ${formatINR(budget)}).`,
            type: 'warning',
            date: 'Today',
            read: false,
          });
        } else if (pct >= 70) {
          newNotifs.push({
            id: 'budget-70',
            title: '70% Budget Approaching',
            message: `You've utilized 70% of your budget. Spend remaining: ${formatINR(budget - spend)}.`,
            type: 'info',
            date: 'Today',
            read: false,
          });
        }

        if (json.potentialDuplicatesCount > 0) {
          newNotifs.push({
            id: 'dup-alert',
            title: 'Potential Duplicates Detected',
            message: `${json.potentialDuplicatesCount} transaction(s) occurred within 15 minutes of an identical charge. Check inbox.`,
            type: 'warning',
            date: 'Today',
            read: false,
          });
        }

        setNotifications(newNotifs);
      }

      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        setCategories(metaJson.categories || []);
        setInstruments(metaJson.instruments || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  // Fast & Natural Language Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await fetch(`/api/transactions?userId=${userId}&q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const json = await res.json();
          setSearchResults(json.transactions);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, userId]);

  // Budget calculations
  const spend = data?.netCurrentSpend || 0;
  const budget = data?.overallBudget || 35000;
  const percentUsed = Math.min(100, Math.round((spend / budget) * 100));

  const progressColor =
    percentUsed >= 90
      ? 'bg-rose-500'
      : percentUsed >= 70
      ? 'bg-amber-400'
      : 'bg-emerald-400';

  const displayedTransactions = searchResults !== null ? searchResults : data?.recentTransactions || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-28 selection:bg-emerald-500 selection:text-black">
      <Navbar
        onOpenAddModal={() => setIsAddOpen(true)}
        pendingCount={data?.pendingReviewCount || 0}
      />

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-5">
        {/* Top Control Bar: Search & In-App Alert Bell */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              data-testid="search-bar"
              type="text"
              placeholder="Search e.g. Swiggy, 450, HPCL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 animate-pulse">
                Searching...
              </span>
            )}
          </div>
          <NotificationCenter
            notifications={notifications}
            onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
          />
        </div>

        {/* Action Required Banner for Pending Review Transactions */}
        {(data?.pendingReviewCount || 0) > 0 && (
          <Link
            href="/inbox"
            className="group flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/50 transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-200">
                  {data?.pendingReviewCount} transaction{data?.pendingReviewCount! > 1 ? 's' : ''} need review
                </p>
                <p className="text-[11px] text-amber-300/70">
                  Assign categories with a single tap & train auto-rules
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}

        {/* Macro Spending Header */}
        <section className="p-5 rounded-3xl bg-gradient-to-b from-zinc-900 to-zinc-900/60 border border-zinc-800/80 shadow-xl relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Net Confirmed Spend
              </span>
              <div
                data-testid="net-confirmed-spend"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 text-white font-mono"
              >
                {formatINR(spend)}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                of <span className="text-zinc-200 font-semibold">{formatINR(budget)}</span> monthly budget
              </div>
            </div>

            {/* Month-over-Month Comparison Pill */}
            {data?.momChangePercent !== null && data?.momChangePercent !== undefined && (
              <div
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  data.momChangePercent > 0
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                {data.momChangePercent > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                <span>
                  {data.momChangePercent > 0 ? `+${data.momChangePercent}%` : `${data.momChangePercent}%`} vs last month
                </span>
              </div>
            )}
          </div>

          {/* Dynamic Budget Progress Bar */}
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-[11px] font-medium text-zinc-400">
              <span>{percentUsed}% Utilized</span>
              <span>
                {spend > budget ? (
                  <span className="text-rose-400 font-bold">Exceeded by {formatINR(spend - budget)}</span>
                ) : (
                  `${formatINR(budget - spend)} remaining`
                )}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Payment Split Cards (Two Dimensions: Rail & Instruments) */}
        <section className="grid grid-cols-2 gap-3">
          {/* Dimension 1: By Rail (UPI vs Card) */}
          <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span className="font-semibold text-zinc-300">By Rail</span>
              <Smartphone className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> UPI Spend
                </span>
                <span className="font-mono font-semibold text-zinc-100">
                  {formatINR(data?.railSplit?.UPI || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" /> Card Swipes
                </span>
                <span className="font-mono font-semibold text-zinc-100">
                  {formatINR(data?.railSplit?.CARD || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Dimension 2: By Instrument */}
          <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span className="font-semibold text-zinc-300">Top Instruments</span>
              <CreditCard className="w-4 h-4 text-purple-400" />
            </div>
            <div className="space-y-1.5 text-xs max-h-20 overflow-y-auto pr-1">
              {(data?.instrumentBreakdown || []).slice(0, 3).map((inst) => (
                <div
                  key={inst.id}
                  data-testid={`instrument-row-${inst.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className="flex justify-between items-center truncate"
                >
                  <span className="text-zinc-400 truncate max-w-[90px]">{inst.name}</span>
                  <span className="font-mono font-semibold text-zinc-100">
                    {formatINR(inst.amount)}
                  </span>
                </div>
              ))}
              {(data?.instrumentBreakdown || []).length === 0 && (
                <div className="text-[11px] text-zinc-500 italic">No activity recorded</div>
              )}
            </div>
          </div>
        </section>

        {/* Category Progress Bars */}
        <section className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              Category Limits
            </h3>
            <span className="text-[10px] text-zinc-500">Live Progress</span>
          </div>

          <div className="space-y-3">
            {(data?.categoryBreakdown || []).map((cat) => {
              const catSpend = cat.spent || 0;
              const catLimit = cat.budget || 5000;
              const pct = Math.min(100, Math.round((catSpend / catLimit) * 100));
              const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-400';

              return (
                <div
                  key={cat.id}
                  data-testid={`category-row-${cat.slug}`}
                  className="space-y-1"
                >
                  <div className="flex justify-between text-xs items-center">
                    <span className="flex items-center gap-2 text-zinc-200">
                      <CategoryIcon name={cat.icon} className="w-3.5 h-3.5 text-zinc-400" />
                      {cat.name}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400">
                      <span data-testid={`category-spent-${cat.slug}`} className="text-zinc-200 font-semibold">{formatINR(catSpend)}</span>
                      {cat.budget ? ` / ${formatINR(cat.budget)}` : ''}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Transactions List */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              {searchQuery ? 'Search Results' : 'Recent Transactions'}
            </h3>
            <span className="text-[11px] text-zinc-500">
              {displayedTransactions.length} items
            </span>
          </div>

          <div className="space-y-2">
            {displayedTransactions.length === 0 ? (
              <div className="text-center py-10 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-2xl p-6">
                <p className="text-sm font-semibold text-zinc-300">No transactions recorded</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Tap the + button to add a transaction manually or connect your email alerts.
                </p>
              </div>
            ) : (
              displayedTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-3 hover:border-zinc-700 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-300">
                      <CategoryIcon name={tx.category?.icon || 'HelpCircle'} className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm text-zinc-100 truncate">
                          {tx.merchant_normalized || tx.merchant_raw}
                        </p>
                        {tx.is_potential_duplicate && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-950 text-red-300 border border-red-800 font-bold shrink-0">
                            Duplicate?
                          </span>
                        )}
                        {tx.status === 'PENDING_REVIEW' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800 font-medium shrink-0">
                            Review
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span>{tx.instrument?.display_name || tx.rail || 'UPI'}</span>
                        <span>•</span>
                        <span>{new Date(tx.transaction_time).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono text-sm font-bold ${
                        tx.type === 'REFUND'
                          ? 'text-emerald-400'
                          : tx.type === 'TRANSFER'
                          ? 'text-zinc-400'
                          : 'text-zinc-100'
                      }`}
                    >
                      {tx.type === 'REFUND' ? '+' : ''}
                      {formatINR(Number(tx.amount))}
                    </div>
                    <span className="text-[10px] text-zinc-500 uppercase">{tx.type}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Manual Entry Modal */}
      <AddTransactionModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        categories={categories}
        instruments={instruments}
        onAdded={fetchData}
        userId={userId}
      />
    </div>
  );
}

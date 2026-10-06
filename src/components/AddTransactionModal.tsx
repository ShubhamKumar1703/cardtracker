'use client';

import React, { useState } from 'react';
import { X, PlusCircle, Check } from 'lucide-react';
import { Category, PaymentInstrument, PaymentRail } from '@/types/database';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  instruments: PaymentInstrument[];
  onAdded: () => void;
  userId: string;
}

export function AddTransactionModal({
  isOpen,
  onClose,
  categories,
  instruments,
  onAdded,
  userId,
}: AddTransactionModalProps) {
  const [amountStr, setAmountStr] = useState('');
  const [merchant, setMerchant] = useState('');
  const [selectedInstId, setSelectedInstId] = useState<string>(
    instruments.find(i => i.display_name.includes('Kiwi'))?.id || instruments[0]?.id || ''
  );
  const [selectedRail, setSelectedRail] = useState<PaymentRail>('UPI');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Keypad button click
  const handleKeyClick = (val: string) => {
    if (val === 'C') {
      setAmountStr('');
    } else if (val === '⌫') {
      setAmountStr(prev => prev.slice(0, -1));
    } else if (val === '.') {
      if (!amountStr.includes('.')) {
        setAmountStr(prev => (prev === '' ? '0.' : prev + '.'));
      }
    } else {
      if (amountStr === '0') {
        setAmountStr(val);
      } else {
        setAmountStr(prev => prev + val);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount');
      return;
    }
    if (!merchant.trim()) {
      setErrorMsg('Please enter a merchant name');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parsedAmount,
          merchant_name: merchant.trim(),
          instrument_id: selectedInstId || null,
          rail: selectedRail,
          category_id: selectedCategoryId || null,
          type: 'DEBIT',
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save transaction');
      }

      onAdded();
      onClose();
      // Reset form
      setAmountStr('');
      setMerchant('');
      setNotes('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-zinc-950 border border-zinc-800 p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-zinc-100">Fast Manual Entry</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs text-center">
            {errorMsg}
          </div>
        )}

        {/* Large Amount Display */}
        <div className="my-4 text-center">
          <span className="text-xs text-zinc-400">Amount</span>
          <div className="text-4xl font-extrabold text-emerald-400 font-mono tracking-tight mt-0.5">
            ₹{amountStr || '0'}
          </div>
        </div>

        {/* Large Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 mb-4 bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/60">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleKeyClick(key)}
              className="py-3 rounded-xl bg-zinc-800/70 hover:bg-zinc-700 active:scale-95 text-lg font-semibold text-zinc-200 transition"
            >
              {key}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Merchant / Store</label>
            <input
              id="merchant-name-input"
              data-testid="merchant-input"
              type="text"
              required
              placeholder="e.g. Swiggy, Blue Tokai, Shell Petrol"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Rail Selector (UPI vs CARD) */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Payment Rail</label>
              <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800">
                {(['UPI', 'CARD'] as PaymentRail[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRail(r)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                      selectedRail === r
                        ? 'bg-emerald-500 text-black shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Instrument Selector */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Payment Instrument</label>
              <select
                id="instrument-select"
                data-testid="instrument-select"
                value={selectedInstId}
                onChange={(e) => setSelectedInstId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {instruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category Grid */}
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {categories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    data-testid={`category-btn-${cat.slug}`}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-medium border text-left truncate transition ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-semibold'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Optional Notes</label>
            <input
              type="text"
              placeholder="e.g. Dinner with team"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            type="submit"
            data-testid="submit-transaction-btn"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] font-bold text-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {isSubmitting ? 'Recording...' : 'Record Transaction'}
          </button>
        </form>
      </div>
    </div>
  );
}

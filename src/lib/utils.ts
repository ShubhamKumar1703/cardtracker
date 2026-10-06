import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Authoritative Spending Calculation rule:
 * - DEBIT + CONFIRMED: ADD amount to spending
 * - REFUND + CONFIRMED: SUBTRACT amount from spending
 * - TRANSFER: EXCLUDE completely
 * - EXCLUDED: EXCLUDE completely
 * - PENDING_REVIEW: EXCLUDE from confirmed spending totals
 */
export function calculateNetConfirmedSpend(transactions: {
  amount: number;
  type: string;
  status: string;
}[]): number {
  return transactions.reduce((acc, tx) => {
    if (tx.status === 'CONFIRMED') {
      if (tx.type === 'DEBIT') return acc + Number(tx.amount);
      if (tx.type === 'REFUND') return acc - Number(tx.amount);
    }
    return acc;
  }, 0);
}

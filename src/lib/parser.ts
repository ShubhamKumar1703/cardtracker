import crypto from 'crypto';
import { categorizeWithGroq } from './groq';
import { PaymentRail, TxStatus, TxType } from '@/types/database';

export interface ParseResult {
  amount: number | null;
  bank_reference_id: string | null;
  merchant_raw: string;
  merchant_normalized: string;
  instrument_hint: string | null;
  rail: PaymentRail | null;
  category_slug: string | null;
  type: TxType;
  status: TxStatus;
  is_transfer: boolean;
  notes: string | null;
  idempotency_fingerprint: string;
}

/**
 * Rounds a date to nearest 15-minute window for Tier 3 fingerprinting
 */
export function roundTo15Minutes(date: Date): string {
  const ms = 1000 * 60 * 15;
  const rounded = new Date(Math.round(date.getTime() / ms) * ms);
  return rounded.toISOString();
}

/**
 * Tier 3 Fallback Fingerprint:
 * SHA256(amount + normalized_merchant + round_to_15min(time))
 */
export function generateFingerprint(amount: number, normalizedMerchant: string, txDate: Date): string {
  const roundedTime = roundTo15Minutes(txDate);
  const rawString = `${amount.toFixed(2)}_${normalizedMerchant.toUpperCase().trim()}_${roundedTime}`;
  return crypto.createHash('sha256').update(rawString).digest('hex');
}

/**
 * Deterministic Regex Parsing Pipeline
 */
export async function parseTransactionAlert(rawText: string, alertDate: Date = new Date()): Promise<ParseResult> {
  const cleanText = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  // 1. Amount: Match /(?:INR|Rs\.?|₹)\s*([\d,]+\.?\d*)/i
  let amount: number | null = null;
  const amountMatch = cleanText.match(/(?:INR|Rs\.?|₹)\s*([\d,]+\.?\d*)/i);
  if (amountMatch && amountMatch[1]) {
    const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (!isNaN(parsedAmount)) {
      amount = parsedAmount;
    }
  }

  // 2. Reference ID: Match /(?:Ref(?:erence)?(?:\s+No\.?)?|UTR|Txn(?:\s+ID)?)\s*[:#]?\s*([A-Za-z0-9]+)/i
  let bank_reference_id: string | null = null;
  const refMatch = cleanText.match(/(?:Ref(?:erence)?(?:\s+No\.?)?|UTR|Txn(?:\s+ID)?)\s*[:#]?\s*([A-Za-z0-9]+)/i);
  if (refMatch && refMatch[1]) {
    bank_reference_id = refMatch[1].trim();
  }

  // 3. Detect Transaction Type
  let type: TxType = 'DEBIT';
  if (/refund|reversed|credited back/i.test(cleanText)) {
    type = 'REFUND';
  } else if (/sent to|transferred to|transfer|credited to account|payment to friend|credit card bill/i.test(cleanText)) {
    // might be transfer
    if (/bill payment|p2p|transferred to/i.test(cleanText)) {
      type = 'TRANSFER';
    }
  }

  // 4. Instrument & Rail Matching
  let instrument_hint: string | null = null;
  let rail: PaymentRail | null = null;

  if (/Kiwi|RuPay|AU Bank|aubank|AU Small Finance/i.test(cleanText)) {
    instrument_hint = 'Kiwi RuPay Card';
    // If spent at UPI/ or UPI txn, rail is UPI; otherwise default to UPI for Kiwi cards
    rail = /UPI/i.test(cleanText) ? 'UPI' : 'CARD';
  } else if (/Axis Neo/i.test(cleanText)) {
    instrument_hint = 'Axis Neo Card';
    rail = /UPI/i.test(cleanText) ? 'UPI' : 'CARD';
  } else if (/Credit Card ending|Axis Bank Card/i.test(cleanText)) {
    instrument_hint = 'Axis Credit Card';
    rail = 'CARD';
  } else if (/UPI\/P2M|debited towards VPA|UPI txn/i.test(cleanText)) {
    instrument_hint = 'Bank Account UPI';
    rail = 'UPI';
  }

  // 5. Merchant Extraction (Regex heuristics)
  let rawMerchant = 'Unknown Merchant';
  // Allow slashes and dots to capture formats like 'UPI/LULU INTERNATIONAL'
  const vpaMatch = cleanText.match(/(?:VPA|to|at|info)\s+([A-Za-z0-9._@\/\- ]{3,45}?)(?:\s+on\s+\d|\s+dated|\s+ref|\s+UTR|\.|$)/i);
  if (vpaMatch && vpaMatch[1]) {
    let extracted = vpaMatch[1].trim();
    // Strip prefixes like UPI/ or VPA/
    extracted = extracted.replace(/^(?:UPI|VPA)\//i, '').trim();
    if (extracted) {
      rawMerchant = extracted;
    }
  }

  let normalizedMerchant = rawMerchant;
  let categorySlug: string | null = null;
  let isTransfer = (type === 'TRANSFER');

  // Merchant keyword matching is driven by database merchant_rules and Groq AI fallback.
  // If not matched by user rules or ambiguous, leave category null to require review.

  // If category or rail is still not certain, invoke Groq AI Fallback
  if (!categorySlug || !rail) {
    const aiResult = await categorizeWithGroq(rawText);
    if (!categorySlug && aiResult.category_slug) {
      categorySlug = aiResult.category_slug;
    }
    if (aiResult.merchant_clean) {
      normalizedMerchant = aiResult.merchant_clean;
    }
    if (!rail && aiResult.rail) {
      rail = aiResult.rail;
    }
    if (aiResult.is_transfer) {
      isTransfer = true;
      type = 'TRANSFER';
    }
  }

  // Philosophy: If rail or instrument cannot be determined with certainty, leave them NULL and set status = 'PENDING_REVIEW'. Never guess.
  const status: TxStatus = (categorySlug && rail && instrument_hint) ? 'CONFIRMED' : 'PENDING_REVIEW';

  const finalAmount = amount ?? 0;
  const idempotency_fingerprint = generateFingerprint(finalAmount, normalizedMerchant, alertDate);

  return {
    amount: finalAmount,
    bank_reference_id,
    merchant_raw: rawMerchant,
    merchant_normalized: normalizedMerchant,
    instrument_hint,
    rail,
    category_slug: categorySlug,
    type,
    status,
    is_transfer: isTransfer,
    notes: null,
    idempotency_fingerprint,
  };
}

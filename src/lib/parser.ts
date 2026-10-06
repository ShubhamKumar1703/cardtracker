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

  if (/A\/c no\.|from your A\/c|Account Number:|UPI\/P2|debited towards VPA|Bank UPI/i.test(cleanText)) {
    instrument_hint = 'Bank Account UPI';
    rail = 'UPI';
  } else if (/Kiwi|RuPay|AU Bank|aubank|AU Small Finance/i.test(cleanText)) {
    instrument_hint = 'Kiwi RuPay Card';
    // If spent at UPI/ or UPI txn, rail is UPI; otherwise default to UPI for Kiwi cards
    rail = /UPI/i.test(cleanText) ? 'UPI' : 'CARD';
  } else if (/Axis Neo/i.test(cleanText)) {
    instrument_hint = 'Axis Neo Card';
    rail = /UPI/i.test(cleanText) ? 'UPI' : 'CARD';
  } else if (/credit card no\.|Credit Card ending|Credit Card/i.test(cleanText)) {
    instrument_hint = 'Axis Credit Card';
    rail = 'CARD';
  } else if (/UPI/i.test(cleanText)) {
    instrument_hint = 'Bank Account UPI';
    rail = 'UPI';
  }

  // 5. Merchant Extraction (Regex heuristics)
  let rawMerchant = 'Unknown Merchant';

  // Check structured "Transaction Info: UPI/P2A/UTR/Recipient" (Axis Bank Direct UPI format)
  const txInfoMatch = rawText.match(/Transaction Info:\s*([^\r\n]+)/i);
  if (txInfoMatch) {
    const parts = txInfoMatch[1].trim().split('/');
    if (parts.length >= 4 && /^UPI$/i.test(parts[0])) {
      if (!bank_reference_id && parts[2]) {
        bank_reference_id = parts[2].trim();
      }
      let recipient = parts.slice(3).join('/').trim();
      recipient = recipient.replace(/^(?:Mr|Ms|Mrs|Dr)\.?\s+/i, '').trim();
      if (recipient) {
        rawMerchant = recipient;
      }
    } else if (txInfoMatch[1].trim()) {
      rawMerchant = txInfoMatch[1].trim();
    }
  }

  // Check structured "Merchant Name:" (Axis Bank Credit Card format)
  if (rawMerchant === 'Unknown Merchant') {
    const merchantNameMatch = rawText.match(/(?:Merchant\s*Name|Merchant)[:\s\r\n]+([^\r\n]+)/i);
    if (merchantNameMatch && merchantNameMatch[1]) {
      const candidate = merchantNameMatch[1].trim();
      const isHeaderOrDisclaimer = /^(?:Axis|Credit|Card|Available|Total|Date|Amount|Dear|INR)\b/i.test(candidate);
      if (candidate && candidate.length >= 2 && !isHeaderOrDisclaimer) {
        rawMerchant = candidate;
      }
    }
  }

  // Fallback heuristic if not already extracted
  if (rawMerchant === 'Unknown Merchant') {
    // Only match 'paid to', 'sent to', 'transferred to', 'spent at', 'at', 'VPA'
    const vpaMatch = cleanText.match(/(?:VPA|paid to|sent to|transferred to|spent at|at)\s+([A-Za-z0-9._@\/\- ]{3,45}?)(?:\s+on|\s+dated|\s+ref|\s+UTR|\.|$)/i);
    if (vpaMatch && vpaMatch[1]) {
      let extracted = vpaMatch[1].trim();
      extracted = extracted.replace(/^(?:UPI|VPA)\//i, '').trim();
      const isDisclaimer = /^(?:help you|block|view|know|connect with|inform you|enter a password|migrated to|Axis Bank Credit Card|your Card)\b/i.test(extracted);
      if (extracted && !isDisclaimer) {
        rawMerchant = extracted;
      }
    }
  }

  let normalizedMerchant = rawMerchant;
  let categorySlug: string | null = null;
  let isTransfer = (type === 'TRANSFER');

  // Merchant keyword matching is driven by database merchant_rules and Groq AI fallback.
  // If not matched by user rules or ambiguous, leave category null to require review.

  // If category, rail, or merchant is still not certain, invoke Groq AI Fallback
  if (!categorySlug || !rail || normalizedMerchant === 'Unknown Merchant') {
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

import { SupabaseClient } from '@supabase/supabase-js';
import { parseTransactionAlert } from './parser';
import { PaymentRail, TxStatus, TxType } from '@/types/database';

export interface IngestionInput {
  userId: string;
  rawText: string;
  messageId?: string;
  transactionTime?: string;
  authMetadata?: {
    spfPass?: boolean;
    dkimPass?: boolean;
    dmarcPass?: boolean;
    recipient?: string;
  };
}

export interface IngestionResult {
  success: boolean;
  action: 'INSERTED' | 'DISCARDED_TIER1' | 'DISCARDED_TIER2' | 'FLAGGED_DUPLICATE';
  transactionId?: string;
  reason?: string;
}

export async function processIngestion(
  supabase: SupabaseClient,
  input: IngestionInput
): Promise<IngestionResult> {
  const { userId, rawText, messageId, transactionTime } = input;
  const txDate = transactionTime ? new Date(transactionTime) : new Date();

  // 1. Parse text via parser engine
  const parsed = await parseTransactionAlert(rawText, txDate);

  // TIER 1 IDEMPOTENCY: bank_reference_id
  if (parsed.bank_reference_id) {
    const { data: existingRef } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('bank_reference_id', parsed.bank_reference_id)
      .maybeSingle();

    if (existingRef) {
      return {
        success: true,
        action: 'DISCARDED_TIER1',
        reason: `Tier 1 duplicate detected (Reference: ${parsed.bank_reference_id})`,
      };
    }
  }

  // TIER 2 IDEMPOTENCY: message_id
  if (messageId) {
    const { data: existingMsg } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('message_id', messageId)
      .maybeSingle();

    if (existingMsg) {
      return {
        success: true,
        action: 'DISCARDED_TIER2',
        reason: `Tier 2 duplicate detected (Message-ID: ${messageId})`,
      };
    }
  }

  // Fetch or map Instrument
  let instrumentId: string | null = null;
  if (parsed.instrument_hint) {
    const { data: inst } = await supabase
      .from('payment_instruments')
      .select('id, default_rail')
      .eq('user_id', userId)
      .ilike('display_name', `%${parsed.instrument_hint}%`)
      .maybeSingle();

    if (inst) {
      instrumentId = inst.id;
      if (!parsed.rail) {
        parsed.rail = inst.default_rail as PaymentRail;
      }
    }
  }

  // Fetch or map Category: First check user's deterministic merchant_rules
  let categoryId: string | null = null;
  let status: TxStatus = 'PENDING_REVIEW';

  const { data: userRules } = await supabase
    .from('merchant_rules')
    .select('pattern, category_id, normalized_name')
    .eq('user_id', userId);

  const upperRaw = (parsed.merchant_raw || '').toUpperCase();
  const matchedRule = (userRules || []).find((r: { pattern: string }) => upperRaw.includes(r.pattern));

  if (matchedRule) {
    categoryId = matchedRule.category_id;
    parsed.merchant_normalized = matchedRule.normalized_name;
    status = 'CONFIRMED';
  } else if (parsed.category_slug) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', parsed.category_slug)
      .maybeSingle();

    if (cat) {
      categoryId = cat.id;
      status = 'CONFIRMED';
    }
  }

  // TIER 3 IDEMPOTENCY: Fallback fingerprint ±15 mins
  // SAFETY RULE: If a match exists within ±15 minutes, NEVER automatically discard or merge.
  // Insert the record, set is_potential_duplicate = TRUE, and set status = 'PENDING_REVIEW' with note: "Potential duplicate of recent transaction".
  const fifteenMinsBefore = new Date(txDate.getTime() - 15 * 60 * 1000).toISOString();
  const fifteenMinsAfter = new Date(txDate.getTime() + 15 * 60 * 1000).toISOString();

  const { data: closeMatches } = await supabase
    .from('transactions')
    .select('id, amount, merchant_normalized')
    .eq('user_id', userId)
    .gte('transaction_time', fifteenMinsBefore)
    .lte('transaction_time', fifteenMinsAfter)
    .eq('amount', parsed.amount);

  let isPotentialDuplicate = false;
  let notes: string | null = parsed.notes;

  if (closeMatches && closeMatches.length > 0) {
    isPotentialDuplicate = true;
    status = 'PENDING_REVIEW';
    notes = 'Potential duplicate of recent transaction';
  }

  // Insert Transaction into Database
  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      amount: parsed.amount,
      currency: 'INR',
      merchant_raw: parsed.merchant_raw,
      merchant_normalized: parsed.merchant_normalized,
      instrument_id: instrumentId,
      rail: parsed.rail,
      category_id: categoryId,
      type: parsed.type as TxType,
      status: status,
      transaction_time: txDate.toISOString(),
      bank_reference_id: parsed.bank_reference_id,
      message_id: messageId || null,
      idempotency_fingerprint: parsed.idempotency_fingerprint,
      is_potential_duplicate: isPotentialDuplicate,
      notes: notes,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to insert transaction: ${error.message}`);
  }

  return {
    success: true,
    action: isPotentialDuplicate ? 'FLAGGED_DUPLICATE' : 'INSERTED',
    transactionId: inserted?.id,
    reason: isPotentialDuplicate ? 'Inserted with potential duplicate flag' : 'Successfully ingested',
  };
}

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

// GET: search transactions with full-text search and filters
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    let userId = searchParams.get('userId');
    const query = searchParams.get('q');
    const status = searchParams.get('status');

    const supabase = getServiceSupabase();

    if (!userId || userId === '00000000-0000-0000-0000-000000000001') {
      const { data: firstCat } = await supabase.from('categories').select('user_id').limit(1).maybeSingle();
      if (firstCat?.user_id) {
        userId = firstCat.user_id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    let dbQuery = supabase
      .from('transactions')
      .select('*, instrument:payment_instruments(*), category:categories(*)')
      .eq('user_id', userId)
      .order('transaction_time', { ascending: false });

    if (status) {
      dbQuery = dbQuery.eq('status', status);
    }

    if (query && query.trim() !== '') {
      // Natural language / fast query
      const cleanQ = query.trim();
      const amountParsed = parseFloat(cleanQ.replace(/[^0-9.]/g, ''));

      if (!isNaN(amountParsed) && amountParsed > 0) {
        dbQuery = dbQuery.or(`merchant_normalized.ilike.%${cleanQ}%,merchant_raw.ilike.%${cleanQ}%,amount.eq.${amountParsed}`);
      } else {
        dbQuery = dbQuery.or(`merchant_normalized.ilike.%${cleanQ}%,merchant_raw.ilike.%${cleanQ}%,notes.ilike.%${cleanQ}%`);
      }
    }

    const { data, error } = await dbQuery.limit(50);
    if (error) throw error;

    return NextResponse.json({ transactions: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: update transaction (category assignment, status update, notes)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    let { id, userId, category_id, status, notes, saveRule, pattern, normalized_name } = body;

    const supabase = getServiceSupabase();

    if (!userId || userId === '00000000-0000-0000-0000-000000000001') {
      const { data: firstCat } = await supabase.from('categories').select('user_id').limit(1).maybeSingle();
      if (firstCat?.user_id) {
        userId = firstCat.user_id;
      }
    }

    if (!id || !userId) {
      return NextResponse.json({ error: 'id and userId are required' }, { status: 400 });
    }

    // 1. Update the transaction
    const updatePayload: Record<string, any> = {};
    if (category_id !== undefined) updatePayload.category_id = category_id;
    if (status !== undefined) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;

    const { data: updatedTx, error: txError } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*, instrument:payment_instruments(*), category:categories(*)')
      .single();

    if (txError) throw txError;

    // 2. If user tapped "Yes" to "Always categorize [Merchant] as [Category]?"
    // insert a new row into merchant_rules
    if (saveRule && pattern && category_id && normalized_name) {
      const cleanPattern = pattern.trim().toUpperCase();
      await supabase
        .from('merchant_rules')
        .upsert({
          user_id: userId,
          pattern: cleanPattern,
          category_id: category_id,
          normalized_name: normalized_name,
        }, { onConflict: 'user_id, pattern' });
    }

    return NextResponse.json({ success: true, transaction: updatedTx });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Manual transaction entry
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let {
      userId,
      amount,
      merchant_name,
      instrument_id,
      rail,
      category_id,
      type = 'DEBIT',
      notes,
    } = body;

    const supabase = getServiceSupabase();

    if (!userId || userId === '00000000-0000-0000-0000-000000000001') {
      const { data: firstCat } = await supabase.from('categories').select('user_id').limit(1).maybeSingle();
      if (firstCat?.user_id) {
        userId = firstCat.user_id;
      }
    }

    if (!userId || !amount || !merchant_name) {
      return NextResponse.json({ error: 'userId, amount, and merchant_name are required' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount: Number(amount),
        currency: 'INR',
        merchant_raw: merchant_name,
        merchant_normalized: merchant_name,
        instrument_id: instrument_id || null,
        rail: rail || 'UPI',
        category_id: category_id || null,
        type: type,
        status: 'CONFIRMED', // Manual entry is immediately confirmed
        transaction_time: new Date().toISOString(),
        notes: notes || null,
      })
      .select('*, instrument:payment_instruments(*), category:categories(*)')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, transaction: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

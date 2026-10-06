import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { calculateNetConfirmedSpend } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    let userId = searchParams.get('userId');
    const monthYear = searchParams.get('month') || new Date().toISOString().slice(0, 7); // e.g. 2026-10

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

    // Calculate current month range
    const [year, month] = monthYear.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();

    // Previous month range for MoM comparison
    const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const prevStart = prevMonthDate.toISOString();
    const prevEnd = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59, 999)).toISOString();

    // 1. Fetch current month transactions
    const { data: currentTxs, error: txError } = await supabase
      .from('transactions')
      .select('*, instrument:payment_instruments(*), category:categories(*)')
      .eq('user_id', userId)
      .gte('transaction_time', startDate)
      .lte('transaction_time', endDate)
      .order('transaction_time', { ascending: false });

    if (txError) throw txError;

    // 2. Fetch previous month transactions for MoM comparison
    const { data: prevTxs } = await supabase
      .from('transactions')
      .select('amount, type, status')
      .eq('user_id', userId)
      .gte('transaction_time', prevStart)
      .lte('transaction_time', prevEnd);

    // 3. Fetch monthly budget
    const { data: budget } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('month_year', monthYear)
      .maybeSingle();

    // 4. Fetch all categories
    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId);

    // 5. Fetch all instruments
    const { data: instruments } = await supabase
      .from('payment_instruments')
      .select('*')
      .eq('user_id', userId);

    // 6. Calculate Net Confirmed Spend using Authoritative Calculation Contract
    const netCurrentSpend = calculateNetConfirmedSpend(currentTxs || []);
    const netPrevSpend = calculateNetConfirmedSpend(prevTxs || []);

    // MoM Percentage Change
    let momChangePercent: number | null = null;
    if (netPrevSpend > 0) {
      momChangePercent = Math.round(((netCurrentSpend - netPrevSpend) / netPrevSpend) * 100);
    }

    // Pending review count
    const pendingReviewCount = (currentTxs || []).filter(tx => tx.status === 'PENDING_REVIEW').length;
    const potentialDuplicatesCount = (currentTxs || []).filter(tx => tx.is_potential_duplicate).length;

    // Split by Rail: UPI Spend vs Card Spend
    let railSplit = {
      UPI: 0,
      CARD: 0,
      NETBANKING: 0,
      CASH: 0,
      OTHER: 0,
    };

    // Split by Instrument
    const instrumentMap: Record<string, { id: string; name: string; amount: number }> = {};
    (instruments || []).forEach(inst => {
      instrumentMap[inst.id] = { id: inst.id, name: inst.display_name, amount: 0 };
    });

    // Category Spend Breakdown
    const categorySpendMap: Record<string, number> = {};
    (categories || []).forEach(cat => {
      categorySpendMap[cat.id] = 0;
    });

    // Authoritative accumulation
    (currentTxs || []).forEach(tx => {
      if (tx.status === 'CONFIRMED') {
        const delta = tx.type === 'DEBIT' ? Number(tx.amount) : tx.type === 'REFUND' ? -Number(tx.amount) : 0;
        
        // Rail accumulation
        if (tx.rail && tx.rail in railSplit) {
          railSplit[tx.rail as keyof typeof railSplit] += delta;
        }

        // Instrument accumulation
        if (tx.instrument_id && instrumentMap[tx.instrument_id]) {
          instrumentMap[tx.instrument_id].amount += delta;
        }

        // Category accumulation
        if (tx.category_id && categorySpendMap[tx.category_id] !== undefined) {
          categorySpendMap[tx.category_id] += delta;
        }
      }
    });

    const categoryBreakdown = (categories || []).map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      budget: cat.monthly_budget,
      spent: Math.max(0, categorySpendMap[cat.id] || 0),
    }));

    const instrumentBreakdown = Object.values(instrumentMap);

    return NextResponse.json({
      monthYear,
      netCurrentSpend,
      netPrevSpend,
      momChangePercent,
      overallBudget: budget?.overall_limit || 35000,
      pendingReviewCount,
      potentialDuplicatesCount,
      railSplit,
      instrumentBreakdown,
      categoryBreakdown,
      recentTransactions: (currentTxs || []).slice(0, 15),
    });
  } catch (error: any) {
    console.error('Analytics API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

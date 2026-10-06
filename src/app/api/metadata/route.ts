import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    let userId = searchParams.get('userId');
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

    const [catRes, instRes] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', userId).order('name'),
      supabase.from('payment_instruments').select('*').eq('user_id', userId).order('display_name'),
    ]);

    return NextResponse.json({
      categories: catRes.data || [],
      instruments: instRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

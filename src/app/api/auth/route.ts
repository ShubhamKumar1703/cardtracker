import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { seedUserDefaultData } from '@/lib/seed';

export async function POST(req: NextRequest) {
  try {
    const { email, password, action } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    if (action === 'signup') {
      // Create user via admin API
      const { data: userData, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createErr) {
        // If user already exists, attempt to sign in instead
        if (createErr.message.toLowerCase().includes('already') || createErr.status === 422) {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInErr) {
            return NextResponse.json({ error: signInErr.message }, { status: 400 });
          }
          if (signInData.user) {
            await seedUserDefaultData(supabase, signInData.user.id);
            return NextResponse.json({ success: true, user: signInData.user, session: signInData.session });
          }
        }
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }

      if (userData.user) {
        // Automatically seed default categories, instruments, rules
        await seedUserDefaultData(supabase, userData.user.id);

        const { data: signInData } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        return NextResponse.json({
          success: true,
          user: userData.user,
          session: signInData?.session || null,
        });
      }
    } else {
      // Login flow
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (data.user) {
        // Ensure seeded
        await seedUserDefaultData(supabase, data.user.id);
      }

      return NextResponse.json({ success: true, user: data.user, session: data.session });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('Auth API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

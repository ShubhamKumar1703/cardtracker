import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { processIngestion } from '@/lib/ingestion';

/**
 * Personal finance ingestion endpoint.
 * Accepts email alert payload from Google Apps Script.
 *
 * Security & Design:
 * - Requires Authorization: Bearer <INGESTION_SECRET_TOKEN>
 * - Rejects missing or invalid tokens (401)
 * - Never accepts arbitrary user_id from client; transactions are bound to the
 *   authenticated personal account context (CARDTRACKER_USER_ID or primary registered user)
 * - Does not expose service role keys or sensitive credentials
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1].trim() : '';

    const ingestionSecret = process.env.INGESTION_SECRET_TOKEN;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const expectedToken = ingestionSecret || serviceKey;

    // Strict authentication check
    if (!token || !expectedToken || token !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing Bearer token' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    // Support rawText, text, or body (common Gmail payload field names)
    const contentToParse =
      (typeof body.rawText === 'string' && body.rawText.trim()) ||
      (typeof body.text === 'string' && body.text.trim()) ||
      (typeof body.body === 'string' && body.body.trim()) ||
      '';

    if (!contentToParse) {
      return NextResponse.json(
        { error: 'Missing required email content (rawText, text, or body)' },
        { status: 400 }
      );
    }

    const messageId = body.messageId || body.message_id || undefined;
    const transactionTime = body.transactionTime || body.date || undefined;

    const supabase = getServiceSupabase();

    // Associate transactions strictly with the single personal account.
    // Client-provided userId is deliberately ignored to prevent account spoofing.
    let userId = process.env.CARDTRACKER_USER_ID;
    if (!userId) {
      const { data: firstCat } = await supabase.from('categories').select('user_id').limit(1).maybeSingle();
      if (firstCat?.user_id) {
        userId = firstCat.user_id;
      } else {
        const { data: users } = await supabase.auth.admin.listUsers();
        if (users?.users?.length) {
          userId = users.users[0].id;
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'No personal user account configured or found in database' },
        { status: 500 }
      );
    }

    const result = await processIngestion(supabase, {
      userId,
      rawText: contentToParse,
      messageId,
      transactionTime,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Ingestion API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

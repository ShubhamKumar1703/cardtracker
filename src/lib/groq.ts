import Groq from 'groq-sdk';

const groqApiKey = process.env.GROQ_API_KEY || '';
const MODEL_NAME = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

let groqInstance: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqInstance) {
    groqInstance = new Groq({ apiKey: groqApiKey });
  }
  return groqInstance;
}

export interface GroqCategorizationResult {
  merchant_clean: string | null;
  category_slug: string | null;
  rail: 'UPI' | 'CARD' | 'NETBANKING' | 'CASH' | null;
  confidence: number;
  is_transfer: boolean;
}

export async function categorizeWithGroq(rawText: string): Promise<GroqCategorizationResult> {
  if (!groqApiKey) {
    console.warn('GROQ_API_KEY is not configured. Falling back to default heuristics.');
    return {
      merchant_clean: null,
      category_slug: null,
      rail: null,
      confidence: 0,
      is_transfer: false,
    };
  }

  const systemPrompt = `
You are a precision parser for Indian UPI and Credit Card bank alerts.
Analyze the transaction text and extract:
1. merchant_clean: Normalized human-readable merchant name, or null if unidentifiable.
2. category_slug: Exactly one of ["food", "groceries", "fuel", "transport", "shopping", "healthcare", "bills", "entertainment", "other"], or null if uncertain.
3. rail: Return "UPI", "CARD", "NETBANKING", or "CASH" ONLY if confident. If ambiguous, uncertain, or not matching these 4 rails, return null. DO NOT return "OTHER".
4. confidence: Float between 0.0 and 1.0 indicating classification confidence.
5. is_transfer: Boolean true if peer-to-peer personal transfer, CC bill payment, or self-transfer; false if merchant expense.

Philosophy: If any field is ambiguous or uncertain, return null for that field. Do not guess.
Return ONLY a valid JSON object matching these keys.
`;

  try {
    const groq = getGroqClient();
    const res = await groq.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const data = JSON.parse(res.choices[0]?.message?.content || '{}');
    
    // Strict rail validation: never allow OTHER or arbitrary strings from AI
    const validRails = ['UPI', 'CARD', 'NETBANKING', 'CASH'];
    const validatedRail = validRails.includes(data.rail) ? data.rail : null;

    return {
      merchant_clean: data.merchant_clean || null,
      category_slug: data.category_slug || null,
      rail: validatedRail,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      is_transfer: Boolean(data.is_transfer),
    };
  } catch (err) {
    console.error('Groq categorization failed:', err);
    return {
      merchant_clean: null,
      category_slug: null,
      rail: null,
      confidence: 0,
      is_transfer: false,
    };
  }
}

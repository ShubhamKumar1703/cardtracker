import { SupabaseClient } from '@supabase/supabase-js';

export async function seedUserDefaultData(supabase: SupabaseClient, userId: string) {
  // Idempotency check: exit if user data is already seeded
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (existing && existing.length > 0) {
    return;
  }

  // 1. Default Categories
  const categoriesToInsert = [
    { user_id: userId, name: 'Food & Dining', slug: 'food', icon: 'Utensils', monthly_budget: 12000 },
    { user_id: userId, name: 'Groceries', slug: 'groceries', icon: 'ShoppingBag', monthly_budget: 6000 },
    { user_id: userId, name: 'Fuel', slug: 'fuel', icon: 'Fuel', monthly_budget: 4000 },
    { user_id: userId, name: 'Transport', slug: 'transport', icon: 'Car', monthly_budget: 3000 },
    { user_id: userId, name: 'Shopping', slug: 'shopping', icon: 'Package', monthly_budget: 5000 },
    { user_id: userId, name: 'Healthcare', slug: 'healthcare', icon: 'HeartPulse', monthly_budget: 2000 },
    { user_id: userId, name: 'Bills & Utilities', slug: 'bills', icon: 'Receipt', monthly_budget: 4000 },
    { user_id: userId, name: 'Entertainment', slug: 'entertainment', icon: 'Film', monthly_budget: 2000 },
    { user_id: userId, name: 'Other / Misc', slug: 'other', icon: 'MoreHorizontal', monthly_budget: null },
  ];

  const { data: insertedCats, error: catErr } = await supabase
    .from('categories')
    .insert(categoriesToInsert)
    .select('id, slug');

  if (catErr) {
    console.error('Error seeding categories:', catErr);
    throw catErr;
  }

  const catMap = Object.fromEntries(insertedCats.map(c => [c.slug, c.id]));

  // 2. Default Instruments
  const instrumentsToInsert = [
    { user_id: userId, display_name: 'Kiwi RuPay Card', provider: 'Kiwi / Partner Bank', default_rail: 'UPI' },
    { user_id: userId, display_name: 'Axis Neo Card', provider: 'Axis Bank', default_rail: 'CARD' },
    { user_id: userId, display_name: 'Axis Credit Card', provider: 'Axis Bank', default_rail: 'CARD' },
    { user_id: userId, display_name: 'Bank Account UPI', provider: 'Primary Bank', default_rail: 'UPI' },
    { user_id: userId, display_name: 'Cash', provider: 'Manual', default_rail: 'CASH' },
  ];

  await supabase.from('payment_instruments').insert(instrumentsToInsert);

  // 3. Default Merchant Rules
  const rulesToInsert = [
    { user_id: userId, pattern: 'SWIGGY', category_id: catMap['food'], normalized_name: 'Swiggy' },
    { user_id: userId, pattern: 'ZOMATO', category_id: catMap['food'], normalized_name: 'Zomato' },
    { user_id: userId, pattern: 'BLINKIT', category_id: catMap['groceries'], normalized_name: 'Blinkit' },
    { user_id: userId, pattern: 'ZEPTO', category_id: catMap['groceries'], normalized_name: 'Zepto' },
    { user_id: userId, pattern: 'INSTAMART', category_id: catMap['groceries'], normalized_name: 'Instamart' },
    { user_id: userId, pattern: 'HPCL', category_id: catMap['fuel'], normalized_name: 'HPCL Petrol Pump' },
    { user_id: userId, pattern: 'IOCL', category_id: catMap['fuel'], normalized_name: 'Indian Oil' },
    { user_id: userId, pattern: 'BPCL', category_id: catMap['fuel'], normalized_name: 'Bharat Petroleum' },
    { user_id: userId, pattern: 'UBER', category_id: catMap['transport'], normalized_name: 'Uber' },
    { user_id: userId, pattern: 'RAPIDO', category_id: catMap['transport'], normalized_name: 'Rapido' },
    { user_id: userId, pattern: 'OLA', category_id: catMap['transport'], normalized_name: 'Ola Cabs' },
    { user_id: userId, pattern: 'APOLLO', category_id: catMap['healthcare'], normalized_name: 'Apollo Pharmacy' },
    { user_id: userId, pattern: 'MEDPLUS', category_id: catMap['healthcare'], normalized_name: 'MedPlus Pharmacy' },
  ].filter(r => Boolean(r.category_id));

  await supabase.from('merchant_rules').insert(rulesToInsert);

  // 4. Initial Monthly Budget
  const monthYear = new Date().toISOString().slice(0, 7);
  await supabase.from('budgets').insert({
    user_id: userId,
    month_year: monthYear,
    overall_limit: 35000,
  });
}

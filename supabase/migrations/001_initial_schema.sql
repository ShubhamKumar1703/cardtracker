-- ==============================================================================
-- MISSION: REAL-TIME EXPENSE TRACKING ENGINE & DASHBOARD (PWA)
-- RUN THIS COMPLETE SCRIPT IN THE SUPABASE SQL EDITOR
-- ==============================================================================

-- ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMS
DO $$ BEGIN
  CREATE TYPE payment_rail AS ENUM ('UPI', 'CARD', 'NETBANKING', 'CASH', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tx_status AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'EXCLUDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tx_type AS ENUM ('DEBIT', 'REFUND', 'TRANSFER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. PAYMENT INSTRUMENTS
CREATE TABLE IF NOT EXISTS payment_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  default_rail payment_rail NOT NULL DEFAULT 'UPI',
  last_four VARCHAR(4),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT NOT NULL,
  monthly_budget NUMERIC(10, 2) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, slug)
);

-- 3. MERCHANT RULES (DETERMINISTIC AI MEMORY)
CREATE TABLE IF NOT EXISTS merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pattern TEXT NOT NULL,            -- Uppercase normalized keyword (e.g. 'SWIGGY', 'HPCL')
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pattern)
);

-- 4. MONTHLY BUDGETS & ALERT TRACKING
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month_year VARCHAR(7) NOT NULL,   -- 'YYYY-MM'
  overall_limit NUMERIC(10, 2) NOT NULL,
  alert_70_sent BOOLEAN DEFAULT FALSE,
  alert_90_sent BOOLEAN DEFAULT FALSE,
  alert_100_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, month_year)
);

-- 5. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  merchant_raw TEXT NOT NULL,
  merchant_normalized TEXT NOT NULL,
  instrument_id UUID REFERENCES payment_instruments(id) ON DELETE SET NULL,
  rail payment_rail,                -- Nullable if rail is ambiguous
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  type tx_type DEFAULT 'DEBIT',
  status tx_status DEFAULT 'PENDING_REVIEW',
  transaction_time TIMESTAMPTZ NOT NULL,
  
  -- IDEMPOTENCY FIELDS
  bank_reference_id TEXT,          -- UTR, UPI Ref, or Auth Code
  message_id TEXT,                 -- Email Message-ID header
  idempotency_fingerprint TEXT,    -- Fallback fingerprint
  is_potential_duplicate BOOLEAN DEFAULT FALSE,
  
  notes TEXT,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES & DEDUPLICATION CONSTRAINTS
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_bank_ref ON transactions(user_id, bank_reference_id) WHERE bank_reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_message_id ON transactions(user_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_user_fingerprint ON transactions(user_id, idempotency_fingerprint);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, transaction_time DESC);
CREATE INDEX IF NOT EXISTS idx_tx_search ON transactions USING GIN(search_vector);

-- FULL-TEXT SEARCH TRIGGER
CREATE OR REPLACE FUNCTION update_transaction_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.merchant_normalized, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.merchant_raw, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tx_search_vector ON transactions;
CREATE TRIGGER trg_tx_search_vector
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION update_transaction_search_vector();

-- ROW LEVEL SECURITY POLICIES
ALTER TABLE payment_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users own instruments" ON payment_instruments FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users own categories" ON categories FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users own merchant_rules" ON merchant_rules FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users own budgets" ON budgets FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. AUTOMATED SIGNUP INITIALIZATION & SEEDING TRIGGER
CREATE OR REPLACE FUNCTION handle_new_user_setup() 
RETURNS trigger AS $$
DECLARE
  cat_food UUID;
  cat_groceries UUID;
  cat_fuel UUID;
  cat_transport UUID;
  cat_shopping UUID;
  cat_health UUID;
  cat_bills UUID;
  cat_ent UUID;
  cat_other UUID;
BEGIN
  -- Idempotency check: exit if user data is already seeded
  IF EXISTS (SELECT 1 FROM categories WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- 1. Default Categories
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Food & Dining', 'food', 'Utensils', 12000) RETURNING id INTO cat_food;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Groceries', 'groceries', 'ShoppingBag', 6000) RETURNING id INTO cat_groceries;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Fuel', 'fuel', 'Fuel', 4000) RETURNING id INTO cat_fuel;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Transport', 'transport', 'Car', 3000) RETURNING id INTO cat_transport;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Shopping', 'shopping', 'Package', 5000) RETURNING id INTO cat_shopping;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Healthcare', 'healthcare', 'HeartPulse', 2000) RETURNING id INTO cat_health;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Bills & Utilities', 'bills', 'Receipt', 4000) RETURNING id INTO cat_bills;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Entertainment', 'entertainment', 'Film', 2000) RETURNING id INTO cat_ent;
  INSERT INTO categories (user_id, name, slug, icon, monthly_budget) VALUES
    (NEW.id, 'Other / Misc', 'other', 'MoreHorizontal', NULL) RETURNING id INTO cat_other;

  -- 2. Default Instruments
  INSERT INTO payment_instruments (user_id, display_name, provider, default_rail) VALUES
    (NEW.id, 'Kiwi RuPay Card', 'Kiwi / Partner Bank', 'UPI'),
    (NEW.id, 'Axis Neo Card', 'Axis Bank', 'CARD'),
    (NEW.id, 'Axis Credit Card', 'Axis Bank', 'CARD'),
    (NEW.id, 'Bank Account UPI', 'Primary Bank', 'UPI'),
    (NEW.id, 'Cash', 'Manual', 'CASH');

  -- 3. Default Merchant Rules
  INSERT INTO merchant_rules (user_id, pattern, category_id, normalized_name) VALUES
    (NEW.id, 'SWIGGY', cat_food, 'Swiggy'),
    (NEW.id, 'ZOMATO', cat_food, 'Zomato'),
    (NEW.id, 'BLINKIT', cat_groceries, 'Blinkit'),
    (NEW.id, 'ZEPTO', cat_groceries, 'Zepto'),
    (NEW.id, 'INSTAMART', cat_groceries, 'Instamart'),
    (NEW.id, 'HPCL', cat_fuel, 'HPCL Petrol Pump'),
    (NEW.id, 'IOCL', cat_fuel, 'Indian Oil'),
    (NEW.id, 'BPCL', cat_fuel, 'Bharat Petroleum'),
    (NEW.id, 'UBER', cat_transport, 'Uber'),
    (NEW.id, 'RAPIDO', cat_transport, 'Rapido'),
    (NEW.id, 'OLA', cat_transport, 'Ola Cabs'),
    (NEW.id, 'APOLLO', cat_health, 'Apollo Pharmacy'),
    (NEW.id, 'MEDPLUS', cat_health, 'MedPlus Pharmacy');

  -- 4. Initial Monthly Budget (Default overall limit = ₹35,000)
  INSERT INTO budgets (user_id, month_year, overall_limit) VALUES
    (NEW.id, to_char(now(), 'YYYY-MM'), 35000);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_setup();

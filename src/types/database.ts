export type PaymentRail = 'UPI' | 'CARD' | 'NETBANKING' | 'CASH' | 'OTHER';
export type TxStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'EXCLUDED';
export type TxType = 'DEBIT' | 'REFUND' | 'TRANSFER';

export interface PaymentInstrument {
  id: string;
  user_id: string;
  display_name: string;
  provider: string;
  default_rail: PaymentRail;
  last_four: string | null;
  created_at?: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  icon: string;
  monthly_budget: number | null;
  created_at?: string;
}

export interface MerchantRule {
  id: string;
  user_id: string;
  pattern: string;
  category_id: string;
  normalized_name: string;
  created_at?: string;
  category?: Category;
}

export interface Budget {
  id: string;
  user_id: string;
  month_year: string; // YYYY-MM
  overall_limit: number;
  alert_70_sent: boolean;
  alert_90_sent: boolean;
  alert_100_sent: boolean;
  created_at?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  merchant_raw: string;
  merchant_normalized: string;
  instrument_id: string | null;
  rail: PaymentRail | null;
  category_id: string | null;
  type: TxType;
  status: TxStatus;
  transaction_time: string;
  bank_reference_id: string | null;
  message_id: string | null;
  idempotency_fingerprint: string | null;
  is_potential_duplicate: boolean;
  notes: string | null;
  search_vector?: string;
  created_at?: string;

  // Joined relations
  instrument?: PaymentInstrument | null;
  category?: Category | null;
}

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'danger';
  date: string;
  read: boolean;
}

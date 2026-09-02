export type Currency = "JPY" | "USD";
export type Frequency = "monthly" | "one_time";
export type BudgetStatus = "surplus" | "balanced" | "deficit";

export interface Expense {
  id: number;
  name: string;
  amount: number;
  budget_month: string | null;
  category_id: number;
  is_fixed: boolean;
  frequency: Frequency;
  expense_date: string | null;
  is_high_leak: boolean;
  leak_tag: string | null;
  sort_order: number;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  cap_amount: number | null;
  color: string;
  sort_order: number;
  expenses: Expense[];
}

export interface CategoryTotal {
  id: number;
  name: string;
  color: string;
  total: number;
  cap_amount: number | null;
  cap_progress: number | null;
}

export interface BudgetSummary {
  month: string;
  currency: Currency;
  total_income: number;
  total_fixed_expenses: number;
  total_variable_expenses: number;
  one_time_fixed_total: number;
  total_expenses: number;
  high_leak_total: number;
  surplus: number;
  surplus_rate: number;
  status: BudgetStatus;
  category_totals: CategoryTotal[];
}

export interface ExpenseInput {
  name: string;
  amount: number;
  budget_month?: string | null;
  category_id: number;
  is_fixed: boolean;
  frequency: Frequency;
  expense_date?: string | null;
  is_high_leak: boolean;
  leak_tag?: string | null;
}

export type ExpenseUpdate = Partial<ExpenseInput>;

export interface BudgetSaveResult {
  id: number;
  month: string;
  currency: Currency;
  monthly_income: number;
  saved_at: string;
}

export interface SpendingTransaction {
  id: number;
  description: string;
  amount: number;
  spent_at: string;
  notes: string | null;
  expense_id: number;
  expense_name: string;
  category_id: number;
  category_name: string;
  category_color: string;
  created_at: string;
}

export interface SpendingTransactionInput {
  description: string;
  amount: number;
  spent_at: string;
  expense_id: number;
  notes?: string | null;
}

export interface SpendingTargetProgress {
  expense_id: number;
  expense_name: string;
  category_id: number;
  category_name: string;
  category_color: string;
  budgeted: number;
  spent: number;
  remaining: number;
  progress: number;
  is_high_leak: boolean;
}

export interface SpendingSummary {
  month: string;
  currency: Currency;
  spent_today: number;
  total_spent: number;
  total_budgeted: number;
  remaining: number;
  transaction_count: number;
  targets: SpendingTargetProgress[];
}

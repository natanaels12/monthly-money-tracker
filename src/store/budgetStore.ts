import { create } from "zustand";

import type {
  BudgetSummary,
  BudgetSaveResult,
  Category,
  Expense,
  ExpenseInput,
  ExpenseUpdate,
  SpendingSummary,
  SpendingTransaction,
  SpendingTransactionInput,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new Error(payload?.detail ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function normalizeExpense(expense: Expense): Expense {
  return { ...expense, amount: Number(expense.amount) };
}

function normalizeCategories(categories: Category[]): Category[] {
  return categories.map((category) => ({
    ...category,
    cap_amount:
      category.cap_amount === null ? null : Number(category.cap_amount),
    expenses: category.expenses.map(normalizeExpense),
  }));
}

function normalizeSummary(summary: BudgetSummary): BudgetSummary {
  return {
    ...summary,
    total_income: Number(summary.total_income),
    total_fixed_expenses: Number(summary.total_fixed_expenses),
    total_variable_expenses: Number(summary.total_variable_expenses),
    one_time_fixed_total: Number(summary.one_time_fixed_total),
    total_expenses: Number(summary.total_expenses),
    high_leak_total: Number(summary.high_leak_total),
    surplus: Number(summary.surplus),
    category_totals: summary.category_totals.map((category) => ({
      ...category,
      total: Number(category.total),
      cap_amount:
        category.cap_amount === null ? null : Number(category.cap_amount),
    })),
  };
}

function normalizeSpendingSummary(summary: SpendingSummary): SpendingSummary {
  return {
    ...summary,
    spent_today: Number(summary.spent_today),
    total_spent: Number(summary.total_spent),
    total_budgeted: Number(summary.total_budgeted),
    remaining: Number(summary.remaining),
    targets: summary.targets.map((target) => ({
      ...target,
      budgeted: Number(target.budgeted),
      spent: Number(target.spent),
      remaining: Number(target.remaining),
    })),
  };
}

function normalizeTransaction(
  transaction: SpendingTransaction,
): SpendingTransaction {
  return { ...transaction, amount: Number(transaction.amount) };
}

async function persistCompletePlan(
  summary: BudgetSummary,
  categories: Category[],
): Promise<BudgetSaveResult> {
  return request<BudgetSaveResult>("/api/v1/budget/plan", {
    method: "PUT",
    body: JSON.stringify({
      month: summary.month,
      currency: summary.currency,
      monthly_income: summary.total_income,
      expenses: categories.flatMap((category) =>
        category.expenses.map((expense) => ({
          expense_id: expense.id,
          amount: expense.amount,
        })),
      ),
    }),
  });
}

async function persistBudgetDraft(
  summary: BudgetSummary,
  categories: Category[],
): Promise<void> {
  await request("/api/v1/budget/draft", {
    method: "PUT",
    body: JSON.stringify({
      month: summary.month,
      currency: summary.currency,
      monthly_income: summary.total_income,
      expenses: categories.flatMap((category) =>
        category.expenses.map((expense) => ({
          expense_id: expense.id,
          amount: expense.amount,
        })),
      ),
    }),
  });
}

interface BudgetStore {
  summary: BudgetSummary | null;
  categories: Category[];
  spendingSummary: SpendingSummary | null;
  transactions: SpendingTransaction[];
  lastSavedAt: string | null;
  budgetDirty: boolean;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  load: () => Promise<void>;
  updateIncome: (
    monthlyIncome: number,
    currency: BudgetSummary["currency"],
    month?: string,
  ) => Promise<void>;
  previewExpense: (expenseId: number, amount: number) => void;
  updateExpense: (
    expenseId: number,
    payload: ExpenseUpdate,
  ) => Promise<void>;
  addExpense: (payload: ExpenseInput) => Promise<void>;
  deleteExpense: (expenseId: number) => Promise<void>;
  updateCategoryCaps: (
    month: string,
    caps: Array<{ category_id: number; cap_amount: number | null }>,
  ) => Promise<void>;
  zeroBalance: () => Promise<void>;
  saveBudget: () => Promise<boolean>;
  beginBudgetEdit: () => Promise<boolean>;
  discardBudgetEdits: () => Promise<boolean>;
  addTransaction: (payload: SpendingTransactionInput) => Promise<void>;
  deleteTransaction: (transactionId: number) => Promise<void>;
  clearError: () => void;
}

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  summary: null,
  categories: [],
  spendingSummary: null,
  transactions: [],
  lastSavedAt: null,
  budgetDirty: false,
  loading: true,
  mutating: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [summary, categories, spendingSummary, transactions, savedBudgets] =
        await Promise.all([
        request<BudgetSummary>("/api/v1/budget/summary"),
        request<Category[]>("/api/v1/categories"),
        request<SpendingSummary>("/api/v1/spending/summary"),
        request<SpendingTransaction[]>("/api/v1/transactions"),
        request<BudgetSaveResult[]>("/api/v1/budget/saved"),
      ]);
      set({
        summary: normalizeSummary(summary),
        categories: normalizeCategories(categories),
        spendingSummary: normalizeSpendingSummary(spendingSummary),
        transactions: transactions.map(normalizeTransaction),
        lastSavedAt:
          get().budgetDirty
            ? null
            : (savedBudgets.find((budget) => budget.month === summary.month)
                ?.saved_at ?? null),
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Unable to load the budget.",
      });
    }
  },

  updateIncome: async (monthlyIncome, currency, month) => {
    const draft = get();
    set({
      mutating: true,
      error: null,
      lastSavedAt: null,
      budgetDirty: true,
    });
    try {
      if (draft.budgetDirty && draft.summary) {
        await persistBudgetDraft(draft.summary, draft.categories);
      }
      await request("/api/v1/budget/income", {
        method: "POST",
        body: JSON.stringify({
          monthly_income: monthlyIncome,
          currency,
          ...(month ? { month } : {}),
        }),
      });
      await get().load();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Income update failed.",
      });
    } finally {
      set({ mutating: false });
    }
  },

  previewExpense: (expenseId, amount) => {
    set((state) => ({
      lastSavedAt: null,
      budgetDirty: true,
      categories: state.categories.map((category) => ({
        ...category,
        expenses: category.expenses.map((expense) =>
          expense.id === expenseId ? { ...expense, amount } : expense,
        ),
      })),
    }));
  },

  updateExpense: async (expenseId, payload) => {
    set({
      mutating: true,
      error: null,
      lastSavedAt: null,
      budgetDirty: true,
    });
    try {
      await request(`/api/v1/expenses/${expenseId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await get().load();
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Expense update failed.",
      });
      await get().load();
    } finally {
      set({ mutating: false });
    }
  },

  addExpense: async (payload) => {
    const draft = get();
    set({
      mutating: true,
      error: null,
      lastSavedAt: null,
      budgetDirty: true,
    });
    try {
      if (draft.budgetDirty && draft.summary) {
        await persistBudgetDraft(draft.summary, draft.categories);
      }
      await request("/api/v1/expenses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await get().load();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Expense creation failed.",
      });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  deleteExpense: async (expenseId) => {
    const draft = get();
    set({
      mutating: true,
      error: null,
      lastSavedAt: null,
      budgetDirty: true,
    });
    try {
      if (draft.budgetDirty && draft.summary) {
        await persistBudgetDraft(draft.summary, draft.categories);
      }
      await request(`/api/v1/expenses/${expenseId}`, { method: "DELETE" });
      await get().load();
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove the budget line.",
      });
    } finally {
      set({ mutating: false });
    }
  },

  updateCategoryCaps: async (month, caps) => {
    const draft = get();
    set({
      mutating: true,
      error: null,
      lastSavedAt: null,
      budgetDirty: true,
    });
    try {
      if (draft.budgetDirty && draft.summary) {
        await persistBudgetDraft(draft.summary, draft.categories);
      }
      await request("/api/v1/categories/caps", {
        method: "PUT",
        body: JSON.stringify({ month, caps }),
      });
      await get().load();
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to update category caps.",
      });
    } finally {
      set({ mutating: false });
    }
  },

  zeroBalance: async () => {
    const draft = get();
    set({
      mutating: true,
      error: null,
      lastSavedAt: null,
      budgetDirty: true,
    });
    try {
      if (draft.budgetDirty && draft.summary) {
        await persistBudgetDraft(draft.summary, draft.categories);
      }
      await request("/api/v1/budget/zero-balance", { method: "POST" });
      await get().load();
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Budget balancing failed.",
      });
    } finally {
      set({ mutating: false });
    }
  },

  saveBudget: async () => {
    set({ mutating: true, error: null });
    try {
      const state = get();
      if (!state.summary) throw new Error("Budget is not loaded.");
      const saved = await persistCompletePlan(state.summary, state.categories);
      set({
        lastSavedAt: saved.saved_at,
        budgetDirty: false,
        mutating: false,
      });
      await get().load();
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Unable to save the budget.",
      });
      return false;
    } finally {
      set({ mutating: false });
    }
  },

  beginBudgetEdit: async () => {
    const summary = get().summary;
    if (!summary) return false;
    set({ mutating: true, error: null });
    try {
      await request("/api/v1/budget/edit-session", {
        method: "POST",
        body: JSON.stringify({ month: summary.month }),
      });
      set({ budgetDirty: false });
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to start budget editing.",
      });
      return false;
    } finally {
      set({ mutating: false });
    }
  },

  discardBudgetEdits: async () => {
    const summary = get().summary;
    if (!summary) return false;
    set({ mutating: true, error: null });
    try {
      await request("/api/v1/budget/discard", {
        method: "POST",
        body: JSON.stringify({ month: summary.month }),
      });
      set({ budgetDirty: false, lastSavedAt: null, mutating: false });
      await get().load();
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to discard budget changes.",
      });
      return false;
    } finally {
      set({ mutating: false });
    }
  },

  addTransaction: async (payload) => {
    set({ mutating: true, error: null });
    try {
      await request("/api/v1/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const [spendingSummary, transactions] = await Promise.all([
        request<SpendingSummary>("/api/v1/spending/summary"),
        request<SpendingTransaction[]>("/api/v1/transactions"),
      ]);
      set({
        spendingSummary: normalizeSpendingSummary(spendingSummary),
        transactions: transactions.map(normalizeTransaction),
      });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Unable to log spending.",
      });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  deleteTransaction: async (transactionId) => {
    set({ mutating: true, error: null });
    try {
      await request(`/api/v1/transactions/${transactionId}`, {
        method: "DELETE",
      });
      const [spendingSummary, transactions] = await Promise.all([
        request<SpendingSummary>("/api/v1/spending/summary"),
        request<SpendingTransaction[]>("/api/v1/transactions"),
      ]);
      set({
        spendingSummary: normalizeSpendingSummary(spendingSummary),
        transactions: transactions.map(normalizeTransaction),
      });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove spending entry.",
      });
    } finally {
      set({ mutating: false });
    }
  },

  clearError: () => set({ error: null }),
}));

export const reportUrl = `${API_URL}/api/v1/report/pdf`;

import {
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  LoaderCircle,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { formatMoney, formatMonth } from "../lib/budget";
import type {
  Category,
  SpendingSummary,
  SpendingTransaction,
  SpendingTransactionInput,
} from "../types";

interface DailySpendingDashboardProps {
  categories: Category[];
  summary: SpendingSummary;
  transactions: SpendingTransaction[];
  busy: boolean;
  onAdd: (payload: SpendingTransactionInput) => Promise<void>;
  onDelete: (transactionId: number) => Promise<void>;
}

function defaultDate(month: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return today.startsWith(month) ? today : `${month}-01`;
}

export function DailySpendingDashboard({
  categories,
  summary,
  transactions,
  busy,
  onAdd,
  onDelete,
}: DailySpendingDashboardProps) {
  const runningGroups = useMemo(
    () =>
      categories
        .map((category) => ({
          ...category,
          expenses: category.expenses.filter(
            (expense) => !expense.is_fixed && expense.leak_tag !== "savings",
          ),
        }))
        .filter((category) => category.expenses.length > 0),
    [categories],
  );
  const firstTarget = runningGroups[0]?.expenses[0]?.id ?? 0;
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseId, setExpenseId] = useState(firstTarget);
  const [spentAt, setSpentAt] = useState(defaultDate(summary.month));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (expenseId === 0 && firstTarget) setExpenseId(firstTarget);
  }, [expenseId, firstTarget]);

  useEffect(() => {
    setSpentAt(defaultDate(summary.month));
  }, [summary.month]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onAdd({
        description,
        amount: Number(amount),
        expense_id: expenseId,
        spent_at: spentAt,
        notes: notes || null,
      });
    } catch {
      return;
    }
    setDescription("");
    setAmount("");
    setNotes("");
  };

  const cards = [
    {
      label: "Spent today",
      value: summary.spent_today,
      icon: CalendarDays,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Spent this month",
      value: summary.total_spent,
      icon: CreditCard,
      color: "bg-orange-50 text-orange-700",
    },
    {
      label: "Running budget left",
      value: summary.remaining,
      icon: WalletCards,
      color:
        summary.remaining < 0
          ? "bg-rose-50 text-rose-600"
          : "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Recorded purchases",
      value: summary.transaction_count,
      icon: Receipt,
      color: "bg-cyan-50 text-cyan-700",
      isCount: true,
    },
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-5 text-white shadow-card sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-300">
              Daily spending
            </p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
              Track every purchase
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Register groceries, dining, konbini runs, and other everyday
              purchases against the targets in your monthly plan.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
            <p className="text-xs font-medium text-slate-300">Tracking period</p>
            <p className="mt-1 font-bold">{formatMonth(summary.month)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color, isCount }) => (
          <article
            key={label}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-600">{label}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {isCount
                    ? value.toLocaleString()
                    : formatMoney(value, summary.currency)}
                </p>
              </div>
              <span className={`rounded-lg p-2.5 ${color}`}>
                <Icon size={19} />
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
              <CircleDollarSign size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
                Quick entry
              </p>
              <h2 className="text-lg font-bold text-slate-950">
                Log a purchase
              </h2>
            </div>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label>
              <span className="form-label">What did you buy?</span>
              <input
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="form-input"
                placeholder="e.g. Lunch at Sukiya"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label>
                <span className="form-label">
                  Amount ({summary.currency})
                </span>
                <input
                  required
                  type="number"
                  min={summary.currency === "JPY" ? "1" : "0.01"}
                  step={summary.currency === "JPY" ? "1" : "0.01"}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="form-input"
                  placeholder="0"
                />
              </label>
              <label>
                <span className="form-label">Date</span>
                <input
                  required
                  type="date"
                  value={spentAt}
                  onChange={(event) => setSpentAt(event.target.value)}
                  className="form-input"
                />
              </label>
            </div>
            <label>
              <span className="form-label">Running budget</span>
              <select
                required
                value={expenseId}
                onChange={(event) => setExpenseId(Number(event.target.value))}
                className="form-input"
              >
                {runningGroups.map((category) => (
                  <optgroup key={category.id} label={category.name}>
                    {category.expenses.map((expense) => (
                      <option key={expense.id} value={expense.id}>
                        {expense.name} -{" "}
                        {formatMoney(expense.amount, summary.currency)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label">Note (optional)</span>
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="form-input"
                placeholder="Payment method or context"
              />
            </label>
            <button
              type="submit"
              disabled={busy || expenseId === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <Plus size={17} />
              )}
              Add daily expense
            </button>
          </form>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
                Running budgets
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                Actual versus planned
              </h2>
            </div>
            <p className="text-sm font-bold text-slate-700">
              {formatMoney(summary.total_spent, summary.currency)}
            </p>
          </div>

          <div className="mt-5 space-y-5">
            {summary.targets.map((target) => {
              const overBudget = target.remaining < 0;
              return (
                <div key={target.expense_id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: target.category_color }}
                        />
                        <p className="truncate text-sm font-bold text-slate-800">
                          {target.expense_name}
                        </p>
                      </div>
                      <p className="ml-[18px] mt-0.5 text-xs text-slate-500">
                        {target.category_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {formatMoney(target.spent, summary.currency)}
                        <span className="font-medium text-slate-400">
                          {" "}
                          / {formatMoney(target.budgeted, summary.currency)}
                        </span>
                      </p>
                      <p
                        className={`mt-0.5 text-xs font-bold ${
                          overBudget ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {overBudget
                          ? `${formatMoney(
                              Math.abs(target.remaining),
                              summary.currency,
                            )} over`
                          : `${formatMoney(
                              target.remaining,
                              summary.currency,
                            )} left`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        overBudget ? "bg-rose-500" : "bg-blue-500"
                      }`}
                      style={{ width: `${Math.min(target.progress, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
              This month
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">
              Recent spending
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
            <TrendingDown size={14} />
            {summary.transaction_count} entries
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="border-t border-slate-100 px-6 py-12 text-center">
            <Receipt className="mx-auto text-slate-300" size={32} />
            <p className="mt-3 text-sm font-bold text-slate-700">
              No daily expenses yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Your first purchase will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center gap-3 px-4 py-3.5 sm:px-6"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: transaction.category_color }}
                >
                  <Receipt size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {transaction.description}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {transaction.expense_name} / {transaction.spent_at}
                    {transaction.notes ? ` / ${transaction.notes}` : ""}
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-950">
                  {formatMoney(transaction.amount, summary.currency)}
                </p>
                <button
                  type="button"
                  onClick={() => void onDelete(transaction.id)}
                  disabled={busy}
                  className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label={`Delete ${transaction.description}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

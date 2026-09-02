import { LoaderCircle, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  Category,
  Currency,
  ExpenseInput,
  Frequency,
} from "../types";

interface AddExpenseModalProps {
  open: boolean;
  categories: Category[];
  currency: Currency;
  month: string;
  kind: "running" | "fixed";
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: ExpenseInput) => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpenseModal({
  open,
  categories,
  currency,
  month,
  kind,
  busy,
  onClose,
  onSubmit,
}: AddExpenseModalProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(0);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [expenseDate, setExpenseDate] = useState(today());
  const [isHighLeak, setIsHighLeak] = useState(false);
  const isFixed = kind === "fixed";
  const eligibleCategories = useMemo(
    () =>
      categories.filter((category) =>
        kind === "running"
          ? ![
              "temporary-commitments",
              "savings-goals",
              "subscriptions-memberships",
            ].includes(category.slug)
          : category.slug !== "savings-goals",
      ),
    [categories, kind],
  );

  useEffect(() => {
    if (open) {
      const preferred =
        kind === "fixed"
          ? categories.find(
              (category) => category.slug === "subscriptions-memberships",
            )
          : categories.find(
              (category) => category.slug === "transportation-living",
            );
      const fallback = eligibleCategories[0];
      if (preferred ?? fallback) {
        setCategoryId((preferred ?? fallback).id);
      }
      setFrequency("monthly");
      setExpenseDate(`${month}-01`);
      setIsHighLeak(false);
    }
  }, [open, kind, month, categories, eligibleCategories]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSubmit({
        name,
        amount: Number(amount),
        budget_month: month,
        category_id: categoryId,
        is_fixed: isFixed,
        frequency,
        expense_date: frequency === "one_time" ? expenseDate : null,
        is_high_leak: isHighLeak,
        leak_tag: isHighLeak ? "micro-spend" : null,
      });
    } catch {
      return;
    }
    setName("");
    setAmount("");
    setFrequency("monthly");
    setIsHighLeak(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-expense-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
    >
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-700">
              {kind === "running" ? "Everyday allowance" : "Monthly commitment"}
            </p>
            <h2
              id="add-expense-title"
              className="mt-1 text-xl font-bold text-slate-950"
            >
              Add {kind === "running" ? "a running budget" : "a fixed budget"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="form-label">Name</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="form-input"
              placeholder={
                kind === "running"
                  ? "e.g. Transportation"
                  : "e.g. Netflix subscription"
              }
            />
          </label>
          <label>
            <span className="form-label">Target amount ({currency})</span>
            <input
              required
              min="0"
              step={currency === "JPY" ? "1" : "0.01"}
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="form-input"
              placeholder="0"
            />
          </label>
          <label>
            <span className="form-label">Category group</span>
            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(Number(event.target.value))}
              className="form-input"
            >
              {eligibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
            <p className="text-xs font-bold text-blue-800">
              {isFixed ? "Fixed monthly cost" : "Running budget"}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-blue-600">
              {isFixed
                ? `Included only in the ${month} plan.`
                : "Available for daily purchase tracking."}
            </p>
          </div>
          <label className={kind === "running" ? "hidden" : ""}>
            <span className="form-label">Frequency</span>
            <select
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value as Frequency)
              }
              className="form-input"
            >
              <option value="monthly">Monthly</option>
              <option value="one_time">One-time</option>
            </select>
          </label>
          {frequency === "one_time" && (
            <label className="sm:col-span-2">
              <span className="form-label">Payment date</span>
              <input
                required
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                className="form-input"
              />
            </label>
          )}
          {!isFixed && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={isHighLeak}
              onChange={(event) => setIsHighLeak(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-700">
                Track as a high-leak expense
              </span>
              <span className="block text-xs text-slate-600">
                Include this item in the monthly micro-spend audit.
              </span>
            </span>
          </label>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <LoaderCircle size={17} className="animate-spin" />
          ) : (
            <Plus size={17} />
          )}
          Add {kind === "running" ? "running budget" : "fixed budget"}
        </button>
      </form>
    </div>
  );
}

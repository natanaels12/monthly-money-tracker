import { Gauge, LoaderCircle, Save, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { formatMoney } from "../lib/budget";
import type { Category, Currency } from "../types";

interface CategoryCapsModalProps {
  open: boolean;
  categories: Category[];
  currency: Currency;
  month: string;
  busy: boolean;
  onClose: () => void;
  onSave: (
    caps: Array<{ category_id: number; cap_amount: number | null }>,
  ) => Promise<void>;
}

export function CategoryCapsModal({
  open,
  categories,
  currency,
  month,
  busy,
  onClose,
  onSave,
}: CategoryCapsModalProps) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    setDrafts(
      Object.fromEntries(
        categories.map((category) => [
          category.id,
          category.cap_amount === null ? "" : String(category.cap_amount),
        ]),
      ),
    );
  }, [open, categories]);

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
    await onSave(
      categories.map((category) => ({
        category_id: category.id,
        cap_amount:
          drafts[category.id] === "" ? null : Number(drafts[category.id]),
      })),
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-caps-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:p-5"
    >
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
              <Gauge size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-700">
                {month} limits
              </p>
              <h2
                id="category-caps-title"
                className="mt-1 text-xl font-bold text-slate-950"
              >
                Edit category caps
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Caps control progress warnings and do not change individual
                budget amounts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close category caps"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {categories.map((category) => {
            const categoryTotal = category.expenses.reduce(
              (sum, expense) => sum + expense.amount,
              0,
            );
            return (
              <label
                key={category.id}
                className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_180px] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate">{category.name}</span>
                  </span>
                  <span className="ml-[18px] mt-1 block text-xs text-slate-600">
                    Planned: {formatMoney(categoryTotal, currency)}
                  </span>
                </span>
                <span>
                  <span className="sr-only">
                    Cap for {category.name} in {currency}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={currency === "JPY" ? "1" : "0.01"}
                    value={drafts[category.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [category.id]: event.target.value,
                      }))
                    }
                    className="form-input"
                    placeholder="No cap"
                  />
                </span>
              </label>
            );
          })}
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-600">
          Leave a field empty to remove that category's cap for this month.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <LoaderCircle size={17} className="animate-spin" />
          ) : (
            <Save size={17} />
          )}
          Save category caps
        </button>
      </form>
    </div>
  );
}

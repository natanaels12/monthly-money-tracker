import { LoaderCircle, Save, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import type { Currency } from "../types";

interface BudgetSettingsModalProps {
  open: boolean;
  income: number;
  currency: Currency;
  month: string;
  busy: boolean;
  onClose: () => void;
  onSave: (income: number, currency: Currency, month: string) => Promise<void>;
}

export function BudgetSettingsModal({
  open,
  income,
  currency,
  month,
  busy,
  onClose,
  onSave,
}: BudgetSettingsModalProps) {
  const [incomeValue, setIncomeValue] = useState(String(income));
  const [currencyValue, setCurrencyValue] = useState<Currency>(currency);
  const [monthValue, setMonthValue] = useState(month);

  useEffect(() => {
    if (!open) return;
    setIncomeValue(String(income));
    setCurrencyValue(currency);
    setMonthValue(month);
  }, [open, income, currency, month]);

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
    await onSave(Number(incomeValue), currencyValue, monthValue);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-settings-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:p-5"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-700">
              Preferences
            </p>
            <h2
              id="budget-settings-title"
              className="mt-1 text-xl font-bold text-slate-950"
            >
              Budget settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="form-label">Monthly take-home income</span>
            <input
              required
              type="number"
              min="0"
              step={currencyValue === "JPY" ? "1" : "0.01"}
              value={incomeValue}
              onChange={(event) => setIncomeValue(event.target.value)}
              className="form-input"
            />
          </label>
          <label>
            <span className="form-label">Currency</span>
            <select
              value={currencyValue}
              onChange={(event) =>
                setCurrencyValue(event.target.value as Currency)
              }
              className="form-input"
            >
              <option value="JPY">JPY - Japanese Yen</option>
              <option value="USD">USD - US Dollar</option>
            </select>
          </label>
          <label>
            <span className="form-label">Budget month</span>
            <input
              required
              type="month"
              value={monthValue}
              onChange={(event) => setMonthValue(event.target.value)}
              className="form-input"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <LoaderCircle size={17} className="animate-spin" />
          ) : (
            <Save size={17} />
          )}
          Save settings
        </button>
      </form>
    </div>
  );
}

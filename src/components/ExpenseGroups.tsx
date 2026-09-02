import {
  CalendarClock,
  ChevronDown,
  Gauge,
  LockKeyhole,
  Pencil,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatMoney } from "../lib/budget";
import type { Category, Currency, Expense } from "../types";

interface ExpenseGroupsProps {
  categories: Category[];
  currency: Currency;
  onPreview: (expenseId: number, amount: number) => void;
  onUpdate: (expenseId: number, amount: number) => Promise<void>;
  onDelete: (expense: Expense) => void;
  busy: boolean;
  editable: boolean;
}

interface ExpenseRowProps {
  expense: Expense;
  currency: Currency;
  onPreview: (expenseId: number, amount: number) => void;
  onUpdate: (expenseId: number, amount: number) => Promise<void>;
  onDelete: (expense: Expense) => void;
  busy: boolean;
  editable: boolean;
}

function ExpenseRow({
  expense,
  currency,
  onPreview,
  onUpdate,
  onDelete,
  busy,
  editable,
}: ExpenseRowProps) {
  const [amount, setAmount] = useState(expense.amount);
  const [fixedDraft, setFixedDraft] = useState(String(expense.amount));
  const [editingFixed, setEditingFixed] = useState(false);
  const committedAmount = useRef(expense.amount);

  useEffect(() => {
    setAmount(expense.amount);
    setFixedDraft(String(expense.amount));
    committedAmount.current = expense.amount;
  }, [expense.amount]);

  useEffect(() => {
    if (!editable) setEditingFixed(false);
  }, [editable]);

  const step = currency === "JPY" ? 1000 : 10;
  const max = Math.max(currency === "JPY" ? 200000 : 2500, amount * 2, step);

  const changeAmount = (next: number) => {
    setAmount(next);
    onPreview(expense.id, next);
  };

  const commit = () => {
    if (amount !== committedAmount.current) {
      committedAmount.current = amount;
      void onUpdate(expense.id, amount);
    }
  };

  const saveFixedAmount = async () => {
    const nextAmount = Number(fixedDraft);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) return;
    if (nextAmount !== committedAmount.current) {
      await onUpdate(expense.id, nextAmount);
    }
    setEditingFixed(false);
  };

  const cancelFixedEdit = () => {
    setFixedDraft(String(committedAmount.current));
    setEditingFixed(false);
  };

  return (
    <div className="grid gap-3 border-t border-slate-200 px-4 py-4 md:grid-cols-[minmax(150px,1fr)_minmax(180px,1.2fr)_150px] md:items-center md:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-800">
            {expense.name}
          </p>
          {expense.is_high_leak && (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600">
              Leak
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
          <span className="flex items-center gap-1">
            {expense.is_fixed ? (
              <LockKeyhole size={11} />
            ) : (
              <SlidersHorizontal size={11} />
            )}
            {expense.is_fixed ? "Fixed" : "Variable"}
          </span>
          <span className="text-slate-300">/</span>
          <span className="flex items-center gap-1">
            {expense.frequency === "one_time" && <CalendarClock size={11} />}
            {expense.frequency === "one_time"
              ? `One-time ${expense.expense_date ?? ""}`
              : "Monthly"}
          </span>
        </div>
      </div>

      <div>
        {expense.is_fixed ? (
          editingFixed ? (
            <label className="block">
              <span className="sr-only">Amount for {expense.name}</span>
              <input
                autoFocus
                type="number"
                min="0"
                step={currency === "JPY" ? "1" : "0.01"}
                value={fixedDraft}
                onChange={(event) => setFixedDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveFixedAmount();
                  } else if (event.key === "Escape") {
                    cancelFixedEdit();
                  }
                }}
                className="form-input py-2"
              />
            </label>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <div className="h-1.5 flex-1 rounded-full bg-slate-200">
                <div className="h-full w-full rounded-full bg-slate-400" />
              </div>
              Fixed for this month
            </div>
          )
        ) : editable ? (
          <>
            <input
              aria-label={`Adjust ${expense.name}`}
              type="range"
              min={0}
              max={max}
              step={step}
              value={amount}
              onChange={(event) => changeAmount(Number(event.target.value))}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
              className="budget-slider w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-500">
              <span>{formatMoney(0, currency)}</span>
              <span>{formatMoney(max, currency)}</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <div className="h-1.5 flex-1 rounded-full bg-blue-100">
              <div className="h-full w-3/5 rounded-full bg-blue-400" />
            </div>
            Running allowance
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <span className="text-xs font-medium text-slate-600 md:hidden">
          Monthly target
        </span>
        <span className="text-sm font-bold tabular-nums text-slate-950">
          {formatMoney(
            editingFixed && fixedDraft !== "" ? Number(fixedDraft) : amount,
            currency,
          )}
        </span>
        {editable && (
          <>
            {expense.is_fixed &&
              (editingFixed ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveFixedAmount()}
                    disabled={
                      busy ||
                      fixedDraft === "" ||
                      Number(fixedDraft) < 0 ||
                      !Number.isFinite(Number(fixedDraft))
                    }
                    className="rounded-lg bg-emerald-50 p-2 text-emerald-600 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Save ${expense.name} amount`}
                    title="Save amount"
                  >
                    <Save size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelFixedEdit}
                    disabled={busy}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                    aria-label={`Cancel editing ${expense.name}`}
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingFixed(true)}
                  disabled={busy}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Edit ${expense.name} amount`}
                  title="Edit amount"
                >
                  <Pencil size={16} />
                </button>
              ))}
            <button
              type="button"
              onClick={() => onDelete(expense)}
              disabled={busy}
              className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Remove ${expense.name}`}
              title={`Remove ${expense.name} from this month`}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ExpenseGroups({
  categories,
  currency,
  onPreview,
  onUpdate,
  onDelete,
  busy,
  editable,
}: ExpenseGroupsProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (categoryId: number) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const total = category.expenses.reduce(
          (sum, expense) => sum + expense.amount,
          0,
        );
        const progress =
          category.cap_amount && category.cap_amount > 0
            ? (total / category.cap_amount) * 100
            : 0;
        const isCollapsed = collapsed.has(category.id);

        return (
          <article
            key={category.id}
            id={`category-${category.slug}`}
              className="scroll-mt-24 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card"
          >
            <button
              type="button"
              onClick={() => toggle(category.id)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:px-5"
            >
              <span
                className="h-9 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="truncate text-sm font-bold text-slate-900">
                      {category.name}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {category.expenses.length} planned items
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {formatMoney(total, currency)}
                      </p>
                      {category.cap_amount && (
                        <p
                          className={`mt-0.5 text-[11px] font-semibold ${
                            progress > 100 ? "text-orange-700" : "text-slate-500"
                          }`}
                        >
                          {Math.round(progress)}% of cap
                        </p>
                      )}
                    </div>
                    <ChevronDown
                      size={18}
                      className={`text-slate-500 transition-transform ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                    />
                  </div>
                </div>
                {category.cap_amount && (
                  <div className="mt-2.5 hidden h-1.5 overflow-hidden rounded-full bg-slate-200 sm:block">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(progress, 100)}%`,
                        backgroundColor:
                          progress > 100 ? "#f97316" : category.color,
                      }}
                    />
                  </div>
                )}
              </div>
            </button>
            {!isCollapsed && (
              <div>
                <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(180px,1.2fr)_150px] gap-3 border-t border-slate-200 bg-slate-50 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 md:grid">
                  <span>Expense</span>
                  <span>{editable ? "Monthly allowance" : "Budget type"}</span>
                  <span className="text-right">Target</span>
                </div>
                {category.expenses.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    currency={currency}
                    onPreview={onPreview}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    busy={busy}
                    editable={editable}
                  />
                ))}
              </div>
            )}
          </article>
        );
      })}
      <div className="flex items-center justify-center gap-2 py-2 text-xs font-medium text-slate-600">
        <Gauge size={14} />
        Move any variable slider to preview cash flow instantly
      </div>
    </div>
  );
}

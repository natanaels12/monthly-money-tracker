import { AlertTriangle, Coffee, ShoppingBag, Sparkles } from "lucide-react";

import { formatMoney } from "../lib/budget";
import type { BudgetSummary, Category } from "../types";

interface HighLeakAuditProps {
  summary: BudgetSummary;
  categories: Category[];
}

export function HighLeakAudit({
  summary,
  categories,
}: HighLeakAuditProps) {
  const leakItems = categories
    .flatMap((category) => category.expenses)
    .filter((expense) => expense.is_high_leak)
    .sort((a, b) => b.amount - a.amount);
  const leakCategory = categories.find((category) =>
    category.slug.includes("high-leak"),
  );
  const cap = leakCategory?.cap_amount ?? 0;
  const progress = cap > 0 ? (summary.high_leak_total / cap) * 100 : 0;
  const overCap = cap > 0 && summary.high_leak_total > cap;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-orange-500" />
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
              Leak audit
            </p>
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-950">
            Small spends, big impact
          </h2>
        </div>
        {overCap && (
          <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">
            <AlertTriangle size={13} />
            Over cap
          </span>
        )}
      </div>

      <div className="mt-5">
        <div className="flex items-end justify-between">
          <p className="text-2xl font-bold text-slate-950">
            {formatMoney(summary.high_leak_total, summary.currency)}
          </p>
          {cap > 0 && (
            <p className="text-xs font-medium text-slate-600">
              of {formatMoney(cap, summary.currency)}
            </p>
          )}
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              overCap ? "bg-orange-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-600">
          {Math.round(progress)}% of the monthly discretionary cap
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {leakItems.slice(0, 3).map((item, index) => {
          const Icon = index === 0 ? ShoppingBag : Coffee;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
            >
              <span className="rounded-lg bg-white p-1.5 text-slate-500 shadow-sm">
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">
                  {item.name}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {item.leak_tag ?? "micro-spend"}
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {formatMoney(item.amount, summary.currency)}
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}

import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Landmark,
  Repeat2,
  WalletCards,
} from "lucide-react";

import { formatMoney } from "../lib/budget";
import type { BudgetSummary } from "../types";

interface SummaryCardsProps {
  summary: BudgetSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      label: "Net income",
      value: summary.total_income,
      icon: Landmark,
      iconClass: "border border-blue-100 bg-blue-50 text-blue-700",
      note: "Take-home this month",
    },
    {
      label: "Fixed expenses",
      value: summary.total_fixed_expenses,
      icon: WalletCards,
      iconClass: "border border-cyan-100 bg-cyan-50 text-cyan-700",
      note: `${formatMoney(summary.one_time_fixed_total, summary.currency)} one-time`,
    },
    {
      label: "Variable expenses",
      value: summary.total_variable_expenses,
      icon: Repeat2,
      iconClass: "border border-amber-100 bg-amber-50 text-amber-700",
      note: "Adjustable allowances",
    },
    {
      label: "Net cash flow",
      value: summary.surplus,
      icon:
        summary.status === "deficit"
          ? ArrowDownRight
          : summary.status === "surplus"
            ? ArrowUpRight
            : CircleDollarSign,
      iconClass:
        summary.status === "deficit"
          ? "border border-rose-100 bg-rose-50 text-rose-700"
          : summary.status === "surplus"
            ? "border border-emerald-100 bg-emerald-50 text-emerald-700"
            : "border border-blue-100 bg-blue-50 text-blue-700",
      note:
        summary.status === "balanced"
          ? "Every unit has a job"
          : `${Math.abs(summary.surplus_rate).toFixed(1)}% ${
              summary.status === "deficit" ? "over budget" : "unallocated"
            }`,
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.label}
            className="group rounded-lg border border-slate-200 bg-white p-5 shadow-card transition duration-200 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-bold leading-tight text-slate-950">
                  {formatMoney(card.value, summary.currency)}
                </p>
              </div>
              <span className={`shrink-0 rounded-lg p-2.5 ${card.iconClass}`}>
                <Icon aria-hidden="true" size={20} strokeWidth={2.25} />
              </span>
            </div>
            <p className="mt-4 line-clamp-1 text-xs font-medium text-slate-600">
              {card.note}
            </p>
          </article>
        );
      })}
    </section>
  );
}

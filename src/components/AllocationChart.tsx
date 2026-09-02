import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatMoney } from "../lib/budget";
import type { BudgetSummary } from "../types";

interface AllocationChartProps {
  summary: BudgetSummary;
}

export function AllocationChart({ summary }: AllocationChartProps) {
  const data = summary.category_totals
    .filter((item) => item.total > 0)
    .map((item) => ({ ...item, value: item.total }));

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
            Allocation
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">
            Where your money goes
          </h2>
        </div>
        <p className="text-sm font-bold text-slate-700">
          {formatMoney(summary.total_expenses, summary.currency)}
        </p>
      </div>

      <div className="relative mt-3 h-48 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={78}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) =>
                formatMoney(Number(value), summary.currency)
              }
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-medium text-slate-600">Spent</span>
          <span className="text-sm font-bold text-slate-900">
            {summary.total_income
              ? `${Math.round((summary.total_expenses / summary.total_income) * 100)}%`
              : "0%"}
          </span>
        </div>
      </div>
    </article>
  );
}

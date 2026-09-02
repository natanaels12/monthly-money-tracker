import { LoaderCircle, Scale, WandSparkles } from "lucide-react";

import { formatMoney } from "../lib/budget";
import type { BudgetSummary } from "../types";

interface ZeroBalancePanelProps {
  summary: BudgetSummary;
  busy: boolean;
  editable: boolean;
  onBalance: () => void;
}

export function ZeroBalancePanel({
  summary,
  busy,
  editable,
  onBalance,
}: ZeroBalancePanelProps) {
  const balanced = summary.status === "balanced";

  return (
    <article className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-5 text-white shadow-card">
      <div>
        <span className="inline-flex rounded-lg bg-blue-500/15 p-2.5 text-blue-300">
          <Scale size={20} />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.1em] text-slate-300">
          Zero-based mode
        </p>
        <h2 className="mt-1 text-xl font-bold">
          {balanced ? "Budget fully assigned" : "Plug the leak"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
          {balanced
            ? "Income minus every planned expense is exactly zero."
            : `Split the ${formatMoney(
                Math.abs(summary.surplus),
                summary.currency,
              )} gap equally across current non-fixed budgets.`}
        </p>
        {editable ? (
          <button
            type="button"
            onClick={onBalance}
            disabled={busy || balanced}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {busy ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <WandSparkles size={17} />
            )}
            {balanced ? "Balanced at zero" : "Auto-balance targets"}
          </button>
        ) : (
          <div className="mt-5 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-center text-xs font-semibold text-slate-300">
            Enter edit mode to auto-balance this plan
          </div>
        )}
      </div>
    </article>
  );
}

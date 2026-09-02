import {
  AlertCircle,
  BarChart3,
  Bell,
  CalendarRange,
  Check,
  CreditCard,
  Download,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Target,
  Wallet,
  X,
} from "lucide-react";
import {
  FormEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AddExpenseModal } from "./components/AddExpenseModal";
import { BudgetSettingsModal } from "./components/BudgetSettingsModal";
import { CategoryCapsModal } from "./components/CategoryCapsModal";
import { DailySpendingDashboard } from "./components/DailySpendingDashboard";
import { ExpenseGroups } from "./components/ExpenseGroups";
import { HighLeakAudit } from "./components/HighLeakAudit";
import { SummaryCards } from "./components/SummaryCards";
import { ZeroBalancePanel } from "./components/ZeroBalancePanel";
import { formatMoney, formatMonth, projectSummary } from "./lib/budget";
import { reportUrl, useBudgetStore } from "./store/budgetStore";
import type { Currency, Expense, ExpenseInput } from "./types";

const AllocationChart = lazy(() =>
  import("./components/AllocationChart").then((module) => ({
    default: module.AllocationChart,
  })),
);

const navItems = [
  { label: "Overview", icon: LayoutDashboard, target: "overview" },
  { label: "Budget plan", icon: Wallet, target: "budget-plan" },
  { label: "Leak audit", icon: BarChart3, target: "leak-audit" },
  { label: "Goals", icon: Target, target: "category-savings-goals" },
  { label: "Reports", icon: ReceiptText, target: "report" },
];

export default function App() {
  const {
    summary: baseSummary,
    categories,
    spendingSummary,
    transactions,
    lastSavedAt,
    budgetDirty,
    loading,
    mutating,
    error,
    load,
    updateIncome,
    previewExpense,
    addExpense,
    deleteExpense,
    updateCategoryCaps,
    zeroBalance,
    saveBudget,
    beginBudgetEdit,
    discardBudgetEdits,
    addTransaction,
    deleteTransaction,
    clearError,
  } = useBudgetStore();
  const [mobileNav, setMobileNav] = useState(false);
  const [incomeEditing, setIncomeEditing] = useState(false);
  const [incomeValue, setIncomeValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"running" | "fixed">("running");
  const [capsOpen, setCapsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [dashboardView, setDashboardView] = useState<"planner" | "spending">(
    "planner",
  );
  const [plannerEditing, setPlannerEditing] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () =>
      baseSummary ? projectSummary(baseSummary, categories) : baseSummary,
    [baseSummary, categories],
  );
  const totalIncome = summary?.total_income;

  useEffect(() => {
    if (totalIncome !== undefined) setIncomeValue(String(totalIncome));
  }, [totalIncome]);

  if (loading && !summary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <LoaderCircle className="mx-auto animate-spin text-blue-400" size={34} />
          <p className="mt-3 text-sm font-medium text-slate-400">
            Building your monthly plan...
          </p>
        </div>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <AlertCircle className="mx-auto text-rose-400" size={32} />
          <h1 className="mt-3 text-xl font-bold">Budget API unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {error ?? "Start the FastAPI server and try again."}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold"
          >
            <RefreshCw size={16} />
            Retry connection
          </button>
        </div>
      </main>
    );
  }

  const submitIncome = async (event: FormEvent) => {
    event.preventDefault();
    await updateIncome(Number(incomeValue), summary.currency);
    setIncomeEditing(false);
  };

  const changeCurrency = async (currency: Currency) => {
    await updateIncome(summary.total_income, currency);
  };

  const createExpense = async (payload: ExpenseInput) => {
    await addExpense(payload);
  };

  const openAddBudget = (kind: "running" | "fixed") => {
    setAddKind(kind);
    setAddOpen(true);
  };

  const removeBudget = (expense: Expense) => {
    const label = expense.is_fixed ? "fixed budget" : "running budget";
    if (
      window.confirm(
        `Remove ${expense.name} from the ${summary.month} ${label} plan?`,
      )
    ) {
      void deleteExpense(expense.id);
    }
  };

  const navigateTo = (target: string) => {
    setMobileNav(false);
    setNotificationsOpen(false);
    if (target === "report") {
      window.open(reportUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setDashboardView("planner");
    window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    setActiveSection(target);
  };

  const showDashboard = async (view: "planner" | "spending") => {
    if (view === "spending" && plannerEditing) {
      const shouldDiscard =
        !budgetDirty ||
        window.confirm(
          "Discard your unsaved monthly budget changes before opening daily spending?",
        );
      if (!shouldDiscard) return;
      const discarded = await discardBudgetEdits();
      if (!discarded) return;
      setPlannerEditing(false);
    }
    setMobileNav(false);
    setNotificationsOpen(false);
    setDashboardView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openSettings = () => {
    setMobileNav(false);
    setNotificationsOpen(false);
    setSettingsOpen(true);
  };

  const saveMonthlyBudget = async () => {
    const saved = await saveBudget();
    if (saved) {
      setPlannerEditing(false);
      setIncomeEditing(false);
    }
  };

  const togglePlannerEditing = async () => {
    setIncomeEditing(false);
    if (!plannerEditing) {
      const started = await beginBudgetEdit();
      if (started) setPlannerEditing(true);
      return;
    }
    const shouldDiscard =
      !budgetDirty ||
      window.confirm("Discard all changes made in this edit session?");
    if (!shouldDiscard) return;
    const discarded = await discardBudgetEdits();
    if (discarded) setPlannerEditing(false);
  };

  const nav = (
    <>
      <div className="flex h-20 items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-950/30">
            <Wallet size={21} strokeWidth={2.4} />
          </span>
          <div>
            <p className="font-bold tracking-tight text-white">Zero Budget</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Every unit assigned
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileNav(false)}
          className="rounded-lg p-2 text-slate-400 lg:hidden"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>
      <nav className="mt-4 space-y-1 px-3">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Dashboards
        </p>
        <button
          type="button"
          onClick={() => void showDashboard("planner")}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
            dashboardView === "planner"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          }`}
        >
          <CalendarRange size={18} />
          Monthly planner
        </button>
        <button
          type="button"
          onClick={() => void showDashboard("spending")}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
            dashboardView === "spending"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          }`}
        >
          <CreditCard size={18} />
          Daily spending
        </button>
        <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Monthly plan
        </p>
        {navItems.map(({ label, icon: Icon, target }) => {
          const active =
            dashboardView === "planner" && activeSection === target;
          return (
          <button
            type="button"
            key={label}
            onClick={() => navigateTo(target)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
              active
                ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
          );
        })}
      </nav>
      <div className="mt-auto p-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs font-bold text-white">Monthly discipline</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Keep variable targets current to make every projection useful.
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-4/5 rounded-full bg-blue-500" />
          </div>
        </div>
        <button
          type="button"
          onClick={openSettings}
          className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <Settings size={18} />
          Settings
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-800 bg-slate-950 lg:flex">
        {nav}
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
          />
          <aside className="relative flex h-full w-72 flex-col border-r border-slate-800 bg-slate-950 shadow-2xl">
            {nav}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="flex min-h-20 flex-wrap items-center gap-2 px-4 py-3 sm:h-20 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-0 xl:px-8">
          <button
            type="button"
            onClick={() => setMobileNav(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-[0.12em] text-blue-700">
              {dashboardView === "planner"
                ? "Monthly cash flow"
                : "Running budget"}
            </p>
            <h1 className="truncate text-lg font-bold text-slate-950 sm:text-xl">
              {formatMonth(summary.month)}
            </h1>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
          {dashboardView === "planner" && (
            <>
              <button
                type="button"
                onClick={() => void saveMonthlyBudget()}
                disabled={mutating}
                title={
                  lastSavedAt
                    ? `Saved ${new Date(lastSavedAt).toLocaleString()}`
                    : "Save a snapshot of this monthly plan"
                }
                className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {lastSavedAt ? <Check size={17} /> : <Save size={17} />}
                <span className="hidden md:inline">
                  {lastSavedAt ? "Saved" : "Save budget"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void togglePlannerEditing()}
                disabled={mutating}
                className={`inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition ${
                  plannerEditing
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {plannerEditing ? (
                  <RotateCcw size={17} />
                ) : (
                  <Pencil size={17} />
                )}
                <span className="hidden md:inline">
                  {plannerEditing ? "Discard changes" : "Edit"}
                </span>
              </button>
            </>
          )}
          <select
            aria-label="Currency"
            value={summary.currency}
            onChange={(event) =>
              void changeCurrency(event.target.value as Currency)
            }
            disabled={mutating || (dashboardView === "planner" && !plannerEditing)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="JPY">JPY</option>
            <option value="USD">USD</option>
          </select>
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative grid h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
            >
              <Bell size={18} />
              {summary.status !== "balanced" && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-950">
                    Budget alerts
                  </h2>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Close notifications"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-800">
                      {summary.status === "balanced"
                        ? "Zero-based target reached"
                        : `${formatMoney(
                            Math.abs(summary.surplus),
                            summary.currency,
                          )} ${
                            summary.status === "deficit"
                              ? "over budget"
                              : "still unallocated"
                          }`}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Adjust variable targets or run the auto-balancer.
                    </p>
                  </div>
                  <div className="rounded-xl bg-orange-50 p-3">
                    <p className="text-xs font-bold text-orange-800">
                      High-leak spending is{" "}
                      {formatMoney(summary.high_leak_total, summary.currency)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-orange-600">
                      Review dining, convenience, and coffee allowances.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <a
            href={reportUrl}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white transition hover:bg-blue-700 sm:px-4"
          >
            <Download size={17} />
            <span className="hidden sm:inline">Export PDF</span>
          </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-rose-400 hover:text-rose-700"
              aria-label="Dismiss error"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {dashboardView === "spending" && spendingSummary ? (
          <DailySpendingDashboard
            categories={categories}
            summary={spendingSummary}
            transactions={transactions}
            busy={mutating}
            onAdd={addTransaction}
            onDelete={deleteTransaction}
          />
        ) : (
          <>
        <section
          id="overview"
          className="mb-4 scroll-mt-24 flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-950 p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
              Available monthly income
            </p>
            {plannerEditing && incomeEditing ? (
              <form onSubmit={submitIncome} className="mt-2 flex gap-2">
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step={summary.currency === "JPY" ? "1" : "0.01"}
                  value={incomeValue}
                  onChange={(event) => setIncomeValue(event.target.value)}
                  className="min-w-0 max-w-60 rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-xl font-bold text-white outline-none placeholder:text-blue-200 focus:bg-white/20"
                />
                <button
                  type="submit"
                  disabled={mutating}
                  className="rounded-xl bg-white px-4 text-sm font-bold text-blue-700 disabled:opacity-60"
                >
                  Save
                </button>
              </form>
            ) : plannerEditing ? (
              <button
                type="button"
                onClick={() => setIncomeEditing(true)}
                className="mt-1 text-left text-3xl font-bold tracking-tight sm:text-4xl"
              >
                {formatMoney(summary.total_income, summary.currency)}
              </button>
            ) : (
              <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                {formatMoney(summary.total_income, summary.currency)}
              </p>
            )}
            <p className="mt-2 text-xs font-medium text-slate-300">
              {plannerEditing
                ? "Click the income amount to edit your take-home pay."
                : "Enter edit mode to change your monthly plan."}
            </p>
          </div>
          <div
            className={`rounded-lg border px-5 py-4 sm:min-w-56 ${
              summary.status === "deficit"
                ? "border-rose-400/30 bg-rose-500/10"
                : summary.status === "balanced"
                  ? "border-emerald-400/30 bg-emerald-400/10"
                  : "border-blue-400/30 bg-blue-500/10"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
              Unallocated
            </p>
            <p className="mt-1 text-2xl font-bold">
              {formatMoney(summary.surplus, summary.currency)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-300">
              {summary.status === "balanced"
                ? "Zero-based target reached"
                : summary.status === "deficit"
                  ? "Reduce variable targets"
                  : "Ready to assign"}
            </p>
          </div>
        </section>

        <SummaryCards summary={summary} />

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div id="budget-plan" className="min-w-0 scroll-mt-24">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Monthly plan
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Running and fixed budgets
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  These budget lines apply only to {formatMonth(summary.month)}.
                </p>
              </div>
              {plannerEditing && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAddBudget("running")}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500"
                >
                  <Plus size={17} />
                  Running budget
                </button>
                <button
                  type="button"
                  onClick={() => openAddBudget("fixed")}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  <Plus size={17} />
                  Fixed budget
                </button>
                <button
                  type="button"
                  onClick={() => setCapsOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  <Gauge size={17} />
                  Category caps
                </button>
              </div>
              )}
            </div>
            <ExpenseGroups
              categories={categories}
              currency={summary.currency}
              busy={mutating}
              editable={plannerEditing}
              onPreview={previewExpense}
              onUpdate={async (expenseId, amount) => {
                previewExpense(expenseId, amount);
              }}
              onDelete={removeBudget}
            />
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <ZeroBalancePanel
              summary={summary}
              busy={mutating}
              editable={plannerEditing}
              onBalance={() => void zeroBalance()}
            />
            <Suspense
              fallback={
                <div className="h-[318px] animate-pulse rounded-2xl border border-slate-200 bg-white shadow-card" />
              }
            >
              <AllocationChart summary={summary} />
            </Suspense>
            <div id="leak-audit" className="scroll-mt-24">
              <HighLeakAudit summary={summary} categories={categories} />
            </div>
          </aside>
        </section>
          </>
        )}
      </main>

      <AddExpenseModal
        open={addOpen}
        categories={categories}
        currency={summary.currency}
        month={summary.month}
        kind={addKind}
        busy={mutating}
        onClose={() => setAddOpen(false)}
        onSubmit={createExpense}
      />
      <BudgetSettingsModal
        open={settingsOpen}
        income={summary.total_income}
        currency={summary.currency}
        month={summary.month}
        busy={mutating}
        onClose={() => setSettingsOpen(false)}
        onSave={updateIncome}
      />
      <CategoryCapsModal
        open={capsOpen}
        categories={categories}
        currency={summary.currency}
        month={summary.month}
        busy={mutating}
        onClose={() => setCapsOpen(false)}
        onSave={(caps) => updateCategoryCaps(summary.month, caps)}
      />
    </div>
  );
}

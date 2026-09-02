import type {
  BudgetStatus,
  BudgetSummary,
  Category,
  Currency,
} from "../types";

export function formatMoney(value: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value);
}

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

export function isActiveExpense(
  frequency: string,
  expenseDate: string | null,
  month: string,
): boolean {
  return frequency === "monthly" || expenseDate?.slice(0, 7) === month;
}

export function projectSummary(
  base: BudgetSummary,
  categories: Category[],
): BudgetSummary {
  let fixed = 0;
  let variable = 0;
  let oneTimeFixed = 0;
  let highLeak = 0;

  const categoryTotals = categories.map((category) => {
    const active = category.expenses.filter((expense) =>
      isActiveExpense(expense.frequency, expense.expense_date, base.month),
    );
    const total = active.reduce((sum, expense) => sum + expense.amount, 0);

    active.forEach((expense) => {
      if (expense.is_fixed) {
        fixed += expense.amount;
        if (expense.frequency === "one_time") {
          oneTimeFixed += expense.amount;
        }
      } else {
        variable += expense.amount;
      }
      if (expense.is_high_leak) highLeak += expense.amount;
    });

    return {
      id: category.id,
      name: category.name,
      color: category.color,
      total,
      cap_amount: category.cap_amount,
      cap_progress:
        category.cap_amount && category.cap_amount > 0
          ? Math.round((total / category.cap_amount) * 1000) / 10
          : null,
    };
  });

  const totalExpenses = fixed + variable;
  const surplus = base.total_income - totalExpenses;
  const status: BudgetStatus =
    surplus > 0 ? "surplus" : surplus < 0 ? "deficit" : "balanced";

  return {
    ...base,
    total_fixed_expenses: fixed,
    total_variable_expenses: variable,
    one_time_fixed_total: oneTimeFixed,
    total_expenses: totalExpenses,
    high_leak_total: highLeak,
    surplus,
    surplus_rate:
      base.total_income === 0
        ? 0
        : Math.round((surplus / base.total_income) * 1000) / 10,
    status,
    category_totals: categoryTotals,
  };
}

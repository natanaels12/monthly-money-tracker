from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CurrencyCode(str, Enum):
    JPY = "JPY"
    USD = "USD"


class ExpenseFrequency(str, Enum):
    MONTHLY = "monthly"
    ONE_TIME = "one_time"


class IncomeUpsert(BaseModel):
    monthly_income: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    currency: CurrencyCode = CurrencyCode.JPY
    month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class IncomeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    monthly_income: Decimal
    currency: CurrencyCode
    month: str
    updated_at: datetime


class ExpenseBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    budget_month: str | None = Field(
        default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"
    )
    category_id: int = Field(gt=0)
    is_fixed: bool = False
    frequency: ExpenseFrequency = ExpenseFrequency.MONTHLY
    expense_date: date | None = None
    is_high_leak: bool = False
    leak_tag: str | None = Field(default=None, max_length=60)

    @field_validator("name", "leak_tag")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def normalize_monthly_date(self) -> "ExpenseBase":
        if self.frequency == ExpenseFrequency.MONTHLY:
            self.expense_date = None
        return self


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    amount: Decimal | None = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )
    budget_month: str | None = Field(
        default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"
    )
    category_id: int | None = Field(default=None, gt=0)
    is_fixed: bool | None = None
    frequency: ExpenseFrequency | None = None
    expense_date: date | None = None
    is_high_leak: bool | None = None
    leak_tag: str | None = Field(default=None, max_length=60)

    @field_validator("name", "leak_tag")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    amount: Decimal
    budget_month: str | None
    category_id: int
    is_fixed: bool
    frequency: ExpenseFrequency
    expense_date: date | None
    is_high_leak: bool
    leak_tag: str | None
    sort_order: int
    updated_at: datetime


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    cap_amount: Decimal | None
    color: str
    sort_order: int
    expenses: list[ExpenseRead]


class CategoryCapValue(BaseModel):
    category_id: int = Field(gt=0)
    cap_amount: Decimal | None = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )


class CategoryCapsUpdate(BaseModel):
    month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    caps: list[CategoryCapValue] = Field(min_length=1)


class CategoryCapRead(CategoryCapValue):
    month: str


class CategoryTotal(BaseModel):
    id: int
    name: str
    color: str
    total: Decimal
    cap_amount: Decimal | None
    cap_progress: float | None


class BudgetSummary(BaseModel):
    month: str
    currency: CurrencyCode
    total_income: Decimal
    total_fixed_expenses: Decimal
    total_variable_expenses: Decimal
    one_time_fixed_total: Decimal
    total_expenses: Decimal
    high_leak_total: Decimal
    surplus: Decimal
    surplus_rate: float
    status: str
    category_totals: list[CategoryTotal]


class BalanceAdjustment(BaseModel):
    expense_id: int
    name: str
    previous_amount: Decimal
    new_amount: Decimal


class ZeroBalanceResult(BaseModel):
    balanced: bool
    adjusted_items: list[BalanceAdjustment]
    summary: BudgetSummary


class BudgetSaveResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    month: str
    currency: CurrencyCode
    monthly_income: Decimal
    saved_at: datetime


class BudgetPlanAmount(BaseModel):
    expense_id: int = Field(gt=0)
    amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class BudgetPlanSave(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    currency: CurrencyCode
    monthly_income: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    expenses: list[BudgetPlanAmount]


class BudgetEditAction(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class BudgetEditSessionRead(BaseModel):
    month: str
    created_at: datetime


class SpendingTransactionCreate(BaseModel):
    description: str = Field(min_length=1, max_length=160)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    expense_id: int = Field(gt=0)
    spent_at: date = Field(default_factory=date.today)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("description", "notes")
    @classmethod
    def strip_transaction_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class SpendingTransactionRead(BaseModel):
    id: int
    description: str
    amount: Decimal
    spent_at: date
    notes: str | None
    expense_id: int
    expense_name: str
    category_id: int
    category_name: str
    category_color: str
    created_at: datetime


class SpendingTargetProgress(BaseModel):
    expense_id: int
    expense_name: str
    category_id: int
    category_name: str
    category_color: str
    budgeted: Decimal
    spent: Decimal
    remaining: Decimal
    progress: float
    is_high_leak: bool


class SpendingSummary(BaseModel):
    month: str
    currency: CurrencyCode
    spent_today: Decimal
    total_spent: Decimal
    total_budgeted: Decimal
    remaining: Decimal
    transaction_count: int
    targets: list[SpendingTargetProgress]

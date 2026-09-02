from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from typing import Iterable

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import delete, inspect, select, text
from sqlalchemy.orm import Session, selectinload

from . import models, schemas
from .database import Base, SessionLocal, engine, get_db


LEAK_KEYWORDS = {
    "konbini": "convenience",
    "convenience": "convenience",
    "coffee": "coffee",
    "cafe": "coffee",
    "subscription": "subscription",
    "streaming": "subscription",
    "takeout": "dining",
    "dining": "dining",
}


def _current_month() -> str:
    return date.today().strftime("%Y-%m")


def _is_active(expense: models.Expense, month: str) -> bool:
    if expense.budget_month is not None and expense.budget_month != month:
        return False
    if expense.frequency == schemas.ExpenseFrequency.MONTHLY.value:
        return True
    return expense.expense_date is not None and expense.expense_date.strftime("%Y-%m") == month


def _money_step(currency: str) -> Decimal:
    return Decimal("1") if currency == schemas.CurrencyCode.JPY.value else Decimal("0.01")


def _money(value: Decimal, currency: str) -> Decimal:
    return Decimal(value).quantize(_money_step(currency), rounding=ROUND_HALF_UP)


def _month_bounds(month: str) -> tuple[date, date]:
    try:
        year, month_number = (int(part) for part in month.split("-"))
        start = date(year, month_number, 1)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Month must use YYYY-MM format.",
        ) from None
    end = date(year + 1, 1, 1) if month_number == 12 else date(year, month_number + 1, 1)
    return start, end


def _get_profile(db: Session) -> models.BudgetProfile:
    profile = db.get(models.BudgetProfile, 1)
    if profile is None:
        profile = models.BudgetProfile(
            id=1,
            monthly_income=Decimal("0"),
            currency=schemas.CurrencyCode.JPY.value,
            month=_current_month(),
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _categories_with_expenses(db: Session) -> list[models.CategoryGroup]:
    return list(
        db.scalars(
            select(models.CategoryGroup)
            .options(selectinload(models.CategoryGroup.expenses))
            .order_by(models.CategoryGroup.sort_order, models.CategoryGroup.id)
        )
        .unique()
        .all()
    )


def _monthly_caps(db: Session, month: str) -> dict[int, Decimal | None]:
    return {
        cap.category_id: cap.amount
        for cap in db.scalars(
            select(models.MonthlyCategoryCap).where(
                models.MonthlyCategoryCap.month == month
            )
        ).all()
    }


def _effective_cap(
    category: models.CategoryGroup,
    monthly_caps: dict[int, Decimal | None],
) -> Decimal | None:
    return (
        monthly_caps[category.id]
        if category.id in monthly_caps
        else category.cap_amount
    )


def _build_summary(db: Session) -> schemas.BudgetSummary:
    profile = _get_profile(db)
    categories = _categories_with_expenses(db)
    monthly_caps = _monthly_caps(db, profile.month)
    fixed_total = Decimal("0")
    variable_total = Decimal("0")
    one_time_fixed_total = Decimal("0")
    high_leak_total = Decimal("0")
    category_totals: list[schemas.CategoryTotal] = []

    for category in categories:
        active = [expense for expense in category.expenses if _is_active(expense, profile.month)]
        category_total = sum((expense.amount for expense in active), Decimal("0"))
        for expense in active:
            if expense.is_fixed:
                fixed_total += expense.amount
                if expense.frequency == schemas.ExpenseFrequency.ONE_TIME.value:
                    one_time_fixed_total += expense.amount
            else:
                variable_total += expense.amount
            if expense.is_high_leak:
                high_leak_total += expense.amount

        cap_progress = None
        cap_amount = _effective_cap(category, monthly_caps)
        if cap_amount is not None and cap_amount > 0:
            cap_progress = round(float(category_total / cap_amount * 100), 1)
        category_totals.append(
            schemas.CategoryTotal(
                id=category.id,
                name=category.name,
                color=category.color,
                total=_money(category_total, profile.currency),
                cap_amount=cap_amount,
                cap_progress=cap_progress,
            )
        )

    income = Decimal(profile.monthly_income)
    total_expenses = fixed_total + variable_total
    surplus = income - total_expenses
    if surplus > 0:
        summary_status = "surplus"
    elif surplus < 0:
        summary_status = "deficit"
    else:
        summary_status = "balanced"

    return schemas.BudgetSummary(
        month=profile.month,
        currency=profile.currency,
        total_income=_money(income, profile.currency),
        total_fixed_expenses=_money(fixed_total, profile.currency),
        total_variable_expenses=_money(variable_total, profile.currency),
        one_time_fixed_total=_money(one_time_fixed_total, profile.currency),
        total_expenses=_money(total_expenses, profile.currency),
        high_leak_total=_money(high_leak_total, profile.currency),
        surplus=_money(surplus, profile.currency),
        surplus_rate=round(float(surplus / income * 100), 1) if income else 0,
        status=summary_status,
        category_totals=category_totals,
    )


def _seed_database(db: Session) -> None:
    if db.scalar(select(models.CategoryGroup.id).limit(1)) is not None:
        _get_profile(db)
        return

    today = date.today()
    profile = models.BudgetProfile(
        id=1,
        monthly_income=Decimal("0"),
        currency=schemas.CurrencyCode.JPY.value,
        month=today.strftime("%Y-%m"),
    )
    groups = [
        models.CategoryGroup(
            id=1,
            name="Housing & Core Utilities",
            slug="housing-core-utilities",
            cap_amount=None,
            color="#2563eb",
            sort_order=1,
        ),
        models.CategoryGroup(
            id=2,
            name="Transportation & Living",
            slug="transportation-living",
            cap_amount=None,
            color="#14b8a6",
            sort_order=2,
        ),
        models.CategoryGroup(
            id=3,
            name="High-Leak Discretionary",
            slug="high-leak-discretionary",
            cap_amount=None,
            color="#f97316",
            sort_order=3,
        ),
        models.CategoryGroup(
            id=4,
            name="Temporary Commitments",
            slug="temporary-commitments",
            cap_amount=None,
            color="#a855f7",
            sort_order=4,
        ),
        models.CategoryGroup(
            id=5,
            name="Savings & Goals",
            slug="savings-goals",
            cap_amount=None,
            color="#22c55e",
            sort_order=5,
        ),
        models.CategoryGroup(
            id=6,
            name="Subscriptions & Memberships",
            slug="subscriptions-memberships",
            cap_amount=None,
            color="#ec4899",
            sort_order=6,
        ),
    ]
    db.add(profile)
    db.add_all(groups)
    db.flush()
    db.add(
        models.Expense(
            name="General spending",
            amount=Decimal("0"),
            budget_month=profile.month,
            category_id=2,
            is_fixed=False,
            sort_order=1,
        )
    )
    db.commit()


def _migrate_database() -> bool:
    columns = {column["name"] for column in inspect(engine).get_columns("expenses")}
    if "budget_month" in columns:
        return False
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE expenses ADD COLUMN budget_month VARCHAR(7)"))
        connection.execute(
            text(
                "UPDATE expenses SET budget_month = "
                "COALESCE((SELECT month FROM budget_profiles WHERE id = 1), :month)"
            ),
            {"month": _current_month()},
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_expenses_budget_month ON expenses (budget_month)")
        )
    return True


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_database()
    with SessionLocal() as db:
        _seed_database(db)
    yield


app = FastAPI(
    title="Zero-Based Budget API",
    version="1.0.0",
    description="Monthly cash-flow planning and zero-based budget balancing.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/budget/summary", response_model=schemas.BudgetSummary, tags=["budget"])
def get_budget_summary(db: Session = Depends(get_db)) -> schemas.BudgetSummary:
    return _build_summary(db)


@app.post(
    "/api/v1/budget/income",
    response_model=schemas.IncomeRead,
    tags=["budget"],
)
def upsert_income(payload: schemas.IncomeUpsert, db: Session = Depends(get_db)) -> models.BudgetProfile:
    profile = _get_profile(db)
    profile.monthly_income = payload.monthly_income
    profile.currency = payload.currency.value
    if payload.month is not None:
        profile.month = payload.month
    db.commit()
    db.refresh(profile)
    return profile


@app.get("/api/v1/categories", response_model=list[schemas.CategoryRead], tags=["categories"])
def get_categories(
    month: str | None = None,
    db: Session = Depends(get_db),
) -> list[schemas.CategoryRead]:
    selected_month = month or _get_profile(db).month
    _month_bounds(selected_month)
    monthly_caps = _monthly_caps(db, selected_month)
    return [
        schemas.CategoryRead(
            id=category.id,
            name=category.name,
            slug=category.slug,
            cap_amount=_effective_cap(category, monthly_caps),
            color=category.color,
            sort_order=category.sort_order,
            expenses=[
                schemas.ExpenseRead.model_validate(expense)
                for expense in category.expenses
                if _is_active(expense, selected_month)
            ],
        )
        for category in _categories_with_expenses(db)
    ]


@app.put(
    "/api/v1/categories/caps",
    response_model=list[schemas.CategoryCapRead],
    tags=["categories"],
)
def update_category_caps(
    payload: schemas.CategoryCapsUpdate,
    db: Session = Depends(get_db),
) -> list[schemas.CategoryCapRead]:
    selected_month = payload.month or _get_profile(db).month
    _month_bounds(selected_month)
    category_ids = [cap.category_id for cap in payload.caps]
    if len(category_ids) != len(set(category_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Each category can appear only once.",
        )

    results: list[models.MonthlyCategoryCap] = []
    for cap_value in payload.caps:
        _require_category(db, cap_value.category_id)
        cap = db.scalar(
            select(models.MonthlyCategoryCap).where(
                models.MonthlyCategoryCap.category_id == cap_value.category_id,
                models.MonthlyCategoryCap.month == selected_month,
            )
        )
        if cap is None:
            cap = models.MonthlyCategoryCap(
                category_id=cap_value.category_id,
                month=selected_month,
            )
            db.add(cap)
        cap.amount = cap_value.cap_amount
        results.append(cap)
    db.commit()
    return [
        schemas.CategoryCapRead(
            category_id=cap.category_id,
            cap_amount=cap.amount,
            month=cap.month,
        )
        for cap in results
    ]


def _require_category(db: Session, category_id: int) -> models.CategoryGroup:
    category = db.get(models.CategoryGroup, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


def _require_expense(db: Session, expense_id: int) -> models.Expense:
    expense = db.get(models.Expense, expense_id)
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget target not found")
    return expense


def _infer_leak_tag(name: str) -> str | None:
    normalized = name.casefold()
    return next(
        (tag for keyword, tag in LEAK_KEYWORDS.items() if keyword in normalized),
        None,
    )


@app.post(
    "/api/v1/expenses",
    response_model=schemas.ExpenseRead,
    status_code=status.HTTP_201_CREATED,
    tags=["expenses"],
)
def create_expense(payload: schemas.ExpenseCreate, db: Session = Depends(get_db)) -> models.Expense:
    _require_category(db, payload.category_id)
    profile = _get_profile(db)
    values = payload.model_dump(mode="python")
    values["budget_month"] = payload.budget_month or profile.month
    values["frequency"] = payload.frequency.value
    inferred_tag = _infer_leak_tag(payload.name)
    if inferred_tag is not None:
        values["is_high_leak"] = True
        values["leak_tag"] = values["leak_tag"] or inferred_tag
    if payload.frequency == schemas.ExpenseFrequency.ONE_TIME and payload.expense_date is None:
        values["expense_date"] = date.today()
    expense = models.Expense(**values)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@app.delete(
    "/api/v1/expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["expenses"],
)
def delete_expense(expense_id: int, db: Session = Depends(get_db)) -> Response:
    expense = _require_expense(db, expense_id)
    transaction_exists = db.scalar(
        select(models.SpendingTransaction.id)
        .where(models.SpendingTransaction.expense_id == expense_id)
        .limit(1)
    )
    if transaction_exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This running budget has recorded spending. Remove its spending entries first.",
        )
    db.delete(expense)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.put("/api/v1/expenses/{expense_id}", response_model=schemas.ExpenseRead, tags=["expenses"])
def update_expense(
    expense_id: int,
    payload: schemas.ExpenseUpdate,
    db: Session = Depends(get_db),
) -> models.Expense:
    expense = db.get(models.Expense, expense_id)
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    values = payload.model_dump(exclude_unset=True, mode="python")
    if "category_id" in values:
        _require_category(db, values["category_id"])
    if "frequency" in values and values["frequency"] is not None:
        values["frequency"] = values["frequency"].value
    for key, value in values.items():
        setattr(expense, key, value)

    if "name" in values and "is_high_leak" not in values:
        inferred_tag = _infer_leak_tag(expense.name)
        if inferred_tag is not None:
            expense.is_high_leak = True
            expense.leak_tag = expense.leak_tag or inferred_tag
    if expense.frequency == schemas.ExpenseFrequency.MONTHLY.value:
        expense.expense_date = None
    elif expense.expense_date is None:
        expense.expense_date = date.today()

    db.commit()
    db.refresh(expense)
    return expense


def _allocate_variable_targets(
    expenses: Iterable[models.Expense],
    target: Decimal,
    currency: str,
) -> list[tuple[models.Expense, Decimal]]:
    adjustable = list(expenses)
    if not adjustable:
        return []

    step = _money_step(currency)
    current_total = sum((expense.amount for expense in adjustable), Decimal("0"))
    adjustment = Decimal(target) - current_total
    raw_amounts = [Decimal(expense.amount) for expense in adjustable]

    active_indexes = list(range(len(raw_amounts)))
    remaining_adjustment = adjustment
    while active_indexes and remaining_adjustment:
        share = remaining_adjustment / len(active_indexes)
        clamped_indexes = [
            index for index in active_indexes if raw_amounts[index] + share < 0
        ]
        if not clamped_indexes:
            for index in active_indexes:
                raw_amounts[index] += share
            remaining_adjustment = Decimal("0")
            break
        for index in clamped_indexes:
            applied_adjustment = -raw_amounts[index]
            raw_amounts[index] = Decimal("0")
            remaining_adjustment -= applied_adjustment
            active_indexes.remove(index)

    rounded_amounts = [_money(max(amount, Decimal("0")), currency) for amount in raw_amounts]
    rounding_difference = _money(target, currency) - sum(
        rounded_amounts, Decimal("0")
    )
    while rounding_difference:
        direction = step if rounding_difference > 0 else -step
        changed = False
        for index in range(len(rounded_amounts)):
            if direction < 0 and rounded_amounts[index] < step:
                continue
            rounded_amounts[index] += direction
            rounding_difference -= direction
            changed = True
            if rounding_difference == 0:
                break
        if not changed:
            break

    return list(zip(adjustable, rounded_amounts))


@app.post(
    "/api/v1/budget/zero-balance",
    response_model=schemas.ZeroBalanceResult,
    tags=["budget"],
)
def zero_balance_budget(db: Session = Depends(get_db)) -> schemas.ZeroBalanceResult:
    profile = _get_profile(db)
    all_expenses = list(db.scalars(select(models.Expense).order_by(models.Expense.id)).all())
    active_expenses = [expense for expense in all_expenses if _is_active(expense, profile.month)]
    fixed_total = sum(
        (expense.amount for expense in active_expenses if expense.is_fixed),
        Decimal("0"),
    )
    variable_expenses = [expense for expense in active_expenses if not expense.is_fixed]
    available = Decimal(profile.monthly_income) - fixed_total

    if available < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fixed expenses exceed income; variable targets cannot close the deficit.",
        )
    if available > 0 and not variable_expenses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add at least one variable expense before running zero-based balancing.",
        )

    adjustments: list[schemas.BalanceAdjustment] = []
    for expense, new_amount in _allocate_variable_targets(
        variable_expenses, available, profile.currency
    ):
        previous = Decimal(expense.amount)
        expense.amount = new_amount
        adjustments.append(
            schemas.BalanceAdjustment(
                expense_id=expense.id,
                name=expense.name,
                previous_amount=_money(previous, profile.currency),
                new_amount=_money(new_amount, profile.currency),
            )
        )
    db.commit()
    summary = _build_summary(db)
    return schemas.ZeroBalanceResult(
        balanced=summary.surplus == 0,
        adjusted_items=adjustments,
        summary=summary,
    )


def _save_budget_snapshot(
    db: Session,
    profile: models.BudgetProfile,
) -> models.BudgetSnapshot:
    categories = _categories_with_expenses(db)
    monthly_caps = _monthly_caps(db, profile.month)
    plan = {
        "month": profile.month,
        "currency": profile.currency,
        "monthly_income": str(profile.monthly_income),
        "categories": [
            {
                "id": category.id,
                "name": category.name,
                "cap_amount": (
                    str(_effective_cap(category, monthly_caps))
                    if _effective_cap(category, monthly_caps) is not None
                    else None
                ),
                "expenses": [
                    {
                        "id": expense.id,
                        "name": expense.name,
                        "amount": str(expense.amount),
                        "is_fixed": expense.is_fixed,
                        "frequency": expense.frequency,
                        "expense_date": (
                            expense.expense_date.isoformat()
                            if expense.expense_date is not None
                            else None
                        ),
                    }
                    for expense in category.expenses
                    if _is_active(expense, profile.month)
                ],
            }
            for category in categories
        ],
    }
    snapshot = db.scalar(
        select(models.BudgetSnapshot).where(models.BudgetSnapshot.month == profile.month)
    )
    if snapshot is None:
        snapshot = models.BudgetSnapshot(month=profile.month)
        db.add(snapshot)
    snapshot.currency = profile.currency
    snapshot.monthly_income = profile.monthly_income
    snapshot.plan_json = json.dumps(plan, ensure_ascii=False)
    snapshot.saved_at = datetime.utcnow()
    db.commit()
    db.refresh(snapshot)
    return snapshot


def _build_edit_backup_payload(
    db: Session,
    profile: models.BudgetProfile,
) -> dict[str, object]:
    expenses = [
        expense
        for expense in db.scalars(
            select(models.Expense).order_by(models.Expense.id)
        ).all()
        if _is_active(expense, profile.month)
    ]
    cap_overrides = list(
        db.scalars(
            select(models.MonthlyCategoryCap).where(
                models.MonthlyCategoryCap.month == profile.month
            )
        ).all()
    )
    return {
        "month": profile.month,
        "currency": profile.currency,
        "monthly_income": str(profile.monthly_income),
        "expenses": [
            {
                "id": expense.id,
                "name": expense.name,
                "amount": str(expense.amount),
                "budget_month": expense.budget_month,
                "category_id": expense.category_id,
                "is_fixed": expense.is_fixed,
                "frequency": expense.frequency,
                "expense_date": (
                    expense.expense_date.isoformat()
                    if expense.expense_date is not None
                    else None
                ),
                "is_high_leak": expense.is_high_leak,
                "leak_tag": expense.leak_tag,
                "sort_order": expense.sort_order,
            }
            for expense in expenses
        ],
        "cap_overrides": [
            {
                "category_id": cap.category_id,
                "amount": str(cap.amount) if cap.amount is not None else None,
            }
            for cap in cap_overrides
        ],
    }


@app.post(
    "/api/v1/budget/edit-session",
    response_model=schemas.BudgetEditSessionRead,
    tags=["budget"],
)
def begin_budget_edit_session(
    payload: schemas.BudgetEditAction,
    db: Session = Depends(get_db),
) -> schemas.BudgetEditSessionRead:
    profile = _get_profile(db)
    if payload.month != profile.month:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected budget month changed. Refresh and try again.",
        )
    backup_payload = _build_edit_backup_payload(db, profile)
    backup = db.scalar(
        select(models.BudgetEditBackup).where(
            models.BudgetEditBackup.month == payload.month
        )
    )
    if backup is None:
        backup = models.BudgetEditBackup(month=payload.month)
        db.add(backup)
    backup.payload_json = json.dumps(
        backup_payload,
        ensure_ascii=False,
    )
    backup.created_at = datetime.utcnow()
    db.commit()
    return schemas.BudgetEditSessionRead(
        month=backup.month,
        created_at=backup.created_at,
    )


@app.post(
    "/api/v1/budget/discard",
    response_model=schemas.BudgetSummary,
    tags=["budget"],
)
def discard_budget_changes(
    payload: schemas.BudgetEditAction,
    db: Session = Depends(get_db),
) -> schemas.BudgetSummary:
    backup = db.scalar(
        select(models.BudgetEditBackup).where(
            models.BudgetEditBackup.month == payload.month
        )
    )
    if backup is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No edit baseline is available to discard.",
        )
    backup_payload = json.loads(backup.payload_json)
    backup_expenses = {
        int(expense["id"]): expense for expense in backup_payload["expenses"]
    }
    current_expenses = [
        expense
        for expense in db.scalars(
            select(models.Expense).where(
                models.Expense.budget_month == payload.month
            )
        ).all()
    ]
    for expense in current_expenses:
        if expense.id in backup_expenses:
            continue
        transaction_exists = db.scalar(
            select(models.SpendingTransaction.id)
            .where(models.SpendingTransaction.expense_id == expense.id)
            .limit(1)
        )
        if transaction_exists is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot discard because {expense.name} has recorded spending.",
            )
        db.delete(expense)

    for expense_id, values in backup_expenses.items():
        expense = db.get(models.Expense, expense_id)
        if expense is None:
            expense = models.Expense(id=expense_id)
            db.add(expense)
        expense.name = values["name"]
        expense.amount = Decimal(values["amount"])
        expense.budget_month = values["budget_month"]
        expense.category_id = values["category_id"]
        expense.is_fixed = values["is_fixed"]
        expense.frequency = values["frequency"]
        expense.expense_date = (
            date.fromisoformat(values["expense_date"])
            if values["expense_date"] is not None
            else None
        )
        expense.is_high_leak = values["is_high_leak"]
        expense.leak_tag = values["leak_tag"]
        expense.sort_order = values["sort_order"]

    db.execute(
        delete(models.MonthlyCategoryCap).where(
            models.MonthlyCategoryCap.month == payload.month
        )
    )
    for cap_values in backup_payload["cap_overrides"]:
        db.add(
            models.MonthlyCategoryCap(
                category_id=cap_values["category_id"],
                month=payload.month,
                amount=(
                    Decimal(cap_values["amount"])
                    if cap_values["amount"] is not None
                    else None
                ),
            )
        )

    profile = _get_profile(db)
    profile.month = backup_payload["month"]
    profile.currency = backup_payload["currency"]
    profile.monthly_income = Decimal(backup_payload["monthly_income"])
    db.delete(backup)
    db.commit()
    return _build_summary(db)


@app.post(
    "/api/v1/budget/save",
    response_model=schemas.BudgetSaveResult,
    tags=["budget"],
)
def save_budget_snapshot(db: Session = Depends(get_db)) -> models.BudgetSnapshot:
    return _save_budget_snapshot(db, _get_profile(db))


def _apply_complete_budget_plan(
    payload: schemas.BudgetPlanSave,
    db: Session,
) -> models.BudgetProfile:
    _month_bounds(payload.month)
    expense_ids = [item.expense_id for item in payload.expenses]
    if len(expense_ids) != len(set(expense_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Each budget line can appear only once.",
        )

    expenses = {
        expense.id: expense
        for expense in db.scalars(
            select(models.Expense).where(models.Expense.id.in_(expense_ids))
        ).all()
    }
    if len(expenses) != len(expense_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more budget lines no longer exist.",
        )
    for item in payload.expenses:
        expense = expenses[item.expense_id]
        if not _is_active(expense, payload.month):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{expense.name} does not belong to {payload.month}.",
            )
        expense.amount = _money(item.amount, payload.currency.value)

    profile = _get_profile(db)
    profile.month = payload.month
    profile.currency = payload.currency.value
    profile.monthly_income = _money(payload.monthly_income, payload.currency.value)
    db.flush()
    return profile


@app.put(
    "/api/v1/budget/draft",
    response_model=schemas.BudgetSummary,
    tags=["budget"],
)
def persist_budget_draft(
    payload: schemas.BudgetPlanSave,
    db: Session = Depends(get_db),
) -> schemas.BudgetSummary:
    _apply_complete_budget_plan(payload, db)
    db.commit()
    return _build_summary(db)


@app.put(
    "/api/v1/budget/plan",
    response_model=schemas.BudgetSaveResult,
    tags=["budget"],
)
def save_complete_budget_plan(
    payload: schemas.BudgetPlanSave,
    db: Session = Depends(get_db),
) -> models.BudgetSnapshot:
    profile = _apply_complete_budget_plan(payload, db)
    db.execute(
        delete(models.BudgetEditBackup).where(
            models.BudgetEditBackup.month == payload.month
        )
    )
    return _save_budget_snapshot(db, profile)


@app.get(
    "/api/v1/budget/saved",
    response_model=list[schemas.BudgetSaveResult],
    tags=["budget"],
)
def get_saved_budgets(db: Session = Depends(get_db)) -> list[models.BudgetSnapshot]:
    return list(
        db.scalars(
            select(models.BudgetSnapshot).order_by(models.BudgetSnapshot.month.desc())
        ).all()
    )


def _transaction_read(
    transaction: models.SpendingTransaction,
    currency: str,
) -> schemas.SpendingTransactionRead:
    return schemas.SpendingTransactionRead(
        id=transaction.id,
        description=transaction.description,
        amount=_money(transaction.amount, currency),
        spent_at=transaction.spent_at,
        notes=transaction.notes,
        expense_id=transaction.expense_id,
        expense_name=transaction.expense.name,
        category_id=transaction.expense.category.id,
        category_name=transaction.expense.category.name,
        category_color=transaction.expense.category.color,
        created_at=transaction.created_at,
    )


def _transactions_for_month(
    db: Session,
    month: str,
) -> list[models.SpendingTransaction]:
    start, end = _month_bounds(month)
    return list(
        db.scalars(
            select(models.SpendingTransaction)
            .where(
                models.SpendingTransaction.spent_at >= start,
                models.SpendingTransaction.spent_at < end,
            )
            .options(
                selectinload(models.SpendingTransaction.expense).selectinload(
                    models.Expense.category
                )
            )
            .order_by(
                models.SpendingTransaction.spent_at.desc(),
                models.SpendingTransaction.id.desc(),
            )
        ).all()
    )


@app.get(
    "/api/v1/transactions",
    response_model=list[schemas.SpendingTransactionRead],
    tags=["spending"],
)
def get_transactions(
    month: str | None = None,
    db: Session = Depends(get_db),
) -> list[schemas.SpendingTransactionRead]:
    profile = _get_profile(db)
    transactions = _transactions_for_month(db, month or profile.month)
    return [_transaction_read(transaction, profile.currency) for transaction in transactions]


@app.post(
    "/api/v1/transactions",
    response_model=schemas.SpendingTransactionRead,
    status_code=status.HTTP_201_CREATED,
    tags=["spending"],
)
def create_transaction(
    payload: schemas.SpendingTransactionCreate,
    db: Session = Depends(get_db),
) -> schemas.SpendingTransactionRead:
    profile = _get_profile(db)
    expense = _require_expense(db, payload.expense_id)
    if expense.is_fixed or expense.leak_tag == "savings":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Daily spending must be assigned to a variable running budget.",
        )
    if (
        expense.budget_month is not None
        and payload.spent_at.strftime("%Y-%m") != expense.budget_month
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The spending date must match the running budget month.",
        )
    values = payload.model_dump(mode="python")
    values["amount"] = _money(payload.amount, profile.currency)
    transaction = models.SpendingTransaction(**values)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    transaction.expense = expense
    return _transaction_read(transaction, profile.currency)


@app.delete(
    "/api/v1/transactions/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["spending"],
)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
) -> Response:
    transaction = db.get(models.SpendingTransaction, transaction_id)
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spending entry not found",
        )
    db.delete(transaction)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/v1/spending/summary",
    response_model=schemas.SpendingSummary,
    tags=["spending"],
)
def get_spending_summary(
    month: str | None = None,
    db: Session = Depends(get_db),
) -> schemas.SpendingSummary:
    profile = _get_profile(db)
    selected_month = month or profile.month
    _month_bounds(selected_month)
    transactions = _transactions_for_month(db, selected_month)
    variable_expenses = [
        expense
        for expense in db.scalars(
            select(models.Expense)
            .options(selectinload(models.Expense.category))
            .order_by(models.Expense.category_id, models.Expense.sort_order)
        ).all()
        if (
            not expense.is_fixed
            and expense.leak_tag != "savings"
            and _is_active(expense, selected_month)
        )
    ]
    spent_by_target: dict[int, Decimal] = {}
    for transaction in transactions:
        spent_by_target[transaction.expense_id] = (
            spent_by_target.get(transaction.expense_id, Decimal("0"))
            + transaction.amount
        )

    targets: list[schemas.SpendingTargetProgress] = []
    for expense in variable_expenses:
        spent = spent_by_target.get(expense.id, Decimal("0"))
        remaining = expense.amount - spent
        targets.append(
            schemas.SpendingTargetProgress(
                expense_id=expense.id,
                expense_name=expense.name,
                category_id=expense.category.id,
                category_name=expense.category.name,
                category_color=expense.category.color,
                budgeted=_money(expense.amount, profile.currency),
                spent=_money(spent, profile.currency),
                remaining=_money(remaining, profile.currency),
                progress=(
                    round(float(spent / expense.amount * 100), 1)
                    if expense.amount
                    else (100.0 if spent else 0.0)
                ),
                is_high_leak=expense.is_high_leak,
            )
        )

    total_spent = sum((transaction.amount for transaction in transactions), Decimal("0"))
    total_budgeted = sum((expense.amount for expense in variable_expenses), Decimal("0"))
    spent_today = sum(
        (
            transaction.amount
            for transaction in transactions
            if transaction.spent_at == date.today()
        ),
        Decimal("0"),
    )
    return schemas.SpendingSummary(
        month=selected_month,
        currency=profile.currency,
        spent_today=_money(spent_today, profile.currency),
        total_spent=_money(total_spent, profile.currency),
        total_budgeted=_money(total_budgeted, profile.currency),
        remaining=_money(total_budgeted - total_spent, profile.currency),
        transaction_count=len(transactions),
        targets=targets,
    )


def _format_currency(value: Decimal, currency: str) -> str:
    if currency == schemas.CurrencyCode.JPY.value:
        return f"¥{Decimal(value):,.0f}"
    return f"${Decimal(value):,.2f}"


@app.get(
    "/api/v1/report/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
    tags=["reports"],
)
def export_pdf_report(db: Session = Depends(get_db)) -> StreamingResponse:
    summary = _build_summary(db)
    categories = _categories_with_expenses(db)
    buffer = BytesIO()

    pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))
    font_name = "HeiseiMin-W3"
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "BudgetTitle",
        parent=styles["Title"],
        fontName=font_name,
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BudgetBody",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=9,
        leading=12,
    )
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"Budget Audit {summary.month}",
    )
    story: list[object] = [
        Paragraph("Zero-Based Budget Audit", title_style),
        Paragraph(
            f"{summary.month} · {summary.currency.value} · Status: {summary.status.title()}",
            body_style,
        ),
        Spacer(1, 6 * mm),
    ]

    overview = [
        ["Income", "Fixed", "Variable", "Surplus", "Surplus rate"],
        [
            _format_currency(summary.total_income, summary.currency.value),
            _format_currency(summary.total_fixed_expenses, summary.currency.value),
            _format_currency(summary.total_variable_expenses, summary.currency.value),
            _format_currency(summary.surplus, summary.currency.value),
            f"{summary.surplus_rate:.1f}%",
        ],
    ]
    overview_table = Table(overview, colWidths=[35 * mm] * 5)
    overview_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f8fafc")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.extend([overview_table, Spacer(1, 7 * mm)])

    rows = [["Category / Item", "Type", "Frequency", "Target"]]
    for category in categories:
        active_items = [item for item in category.expenses if _is_active(item, summary.month)]
        rows.append(
            [
                category.name,
                "",
                "",
                _format_currency(
                    sum((item.amount for item in active_items), Decimal("0")),
                    summary.currency.value,
                ),
            ]
        )
        for item in active_items:
            marker = " · High leak" if item.is_high_leak else ""
            date_label = (
                item.expense_date.isoformat()
                if item.frequency == schemas.ExpenseFrequency.ONE_TIME.value
                and item.expense_date
                else item.frequency.replace("_", " ").title()
            )
            rows.append(
                [
                    f"  {item.name}{marker}",
                    "Fixed" if item.is_fixed else "Variable",
                    date_label,
                    _format_currency(item.amount, summary.currency.value),
                ]
            )

    detail_table = Table(rows, colWidths=[76 * mm, 28 * mm, 40 * mm, 31 * mm], repeatRows=1)
    detail_style = [
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    row_index = 1
    for category in categories:
        active_count = sum(1 for item in category.expenses if _is_active(item, summary.month))
        detail_style.extend(
            [
                ("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#e2e8f0")),
                ("FONTNAME", (0, row_index), (-1, row_index), font_name),
            ]
        )
        row_index += active_count + 1
    detail_table.setStyle(TableStyle(detail_style))
    story.extend([detail_table, Spacer(1, 7 * mm)])

    savings = [
        item
        for category in categories
        if "saving" in category.name.lower()
        for item in category.expenses
        if _is_active(item, summary.month)
    ]
    if savings:
        savings_text = ", ".join(
            f"{item.name}: {_format_currency(item.amount, summary.currency.value)}"
            for item in savings
        )
        story.append(Paragraph(f"Active savings targets: {savings_text}", body_style))
    story.append(
        Paragraph(
            f"High-leak spending: {_format_currency(summary.high_leak_total, summary.currency.value)} · "
            f"One-time fixed costs: {_format_currency(summary.one_time_fixed_total, summary.currency.value)}",
            body_style,
        )
    )

    document.build(story)
    buffer.seek(0)
    filename = f"budget-audit-{summary.month}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

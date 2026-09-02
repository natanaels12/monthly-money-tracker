from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class BudgetProfile(Base):
    __tablename__ = "budget_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    monthly_income: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="JPY")
    month: Mapped[str] = mapped_column(String(7), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BudgetSnapshot(Base):
    __tablename__ = "budget_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False, unique=True, index=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    monthly_income: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    plan_json: Mapped[str] = mapped_column(Text, nullable=False)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BudgetEditBackup(Base):
    __tablename__ = "budget_edit_backups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False, unique=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )


class CategoryGroup(Base):
    __tablename__ = "category_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    cap_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#64748b")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    expenses: Mapped[list["Expense"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="Expense.sort_order",
    )


class MonthlyCategoryCap(Base):
    __tablename__ = "monthly_category_caps"
    __table_args__ = (
        UniqueConstraint("category_id", "month", name="uq_category_cap_month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("category_groups.id"), nullable=False, index=True
    )
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    budget_month: Mapped[str | None] = mapped_column(
        String(7), nullable=True, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("category_groups.id"), nullable=False, index=True
    )
    is_fixed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")
    expense_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_high_leak: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    leak_tag: Mapped[str | None] = mapped_column(String(60), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    category: Mapped[CategoryGroup] = relationship(back_populates="expenses")
    transactions: Mapped[list["SpendingTransaction"]] = relationship(
        back_populates="expense",
        cascade="all, delete-orphan",
    )


class SpendingTransaction(Base):
    __tablename__ = "spending_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    expense_id: Mapped[int] = mapped_column(
        ForeignKey("expenses.id"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(160), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    spent_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    expense: Mapped[Expense] = relationship(back_populates="transactions")

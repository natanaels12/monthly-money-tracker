import os
import tempfile
import unittest
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient


class BudgetApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(cls.temp_dir.name) / "test.db"
        os.environ["BUDGET_DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

        from backend.main import app

        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_context.__exit__(None, None, None)
        from backend.database import engine

        engine.dispose()
        cls.temp_dir.cleanup()

    def test_summary_and_categories_are_seeded(self) -> None:
        summary = self.client.get("/api/v1/budget/summary")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.json()["currency"], "JPY")
        self.assertGreater(float(summary.json()["total_income"]), 0)
        self.assertTrue(summary.json()["category_totals"])

        categories = self.client.get("/api/v1/categories")
        self.assertEqual(categories.status_code, 200)
        self.assertGreaterEqual(len(categories.json()), 5)

    def test_income_expense_update_and_zero_balance(self) -> None:
        income = self.client.post(
            "/api/v1/budget/income",
            json={"monthly_income": 500000, "currency": "JPY"},
        )
        self.assertEqual(income.status_code, 200)

        categories = self.client.get("/api/v1/categories").json()
        variable = next(
            item
            for category in categories
            for item in category["expenses"]
            if not item["is_fixed"]
        )
        updated = self.client.put(
            f"/api/v1/expenses/{variable['id']}",
            json={"amount": 60000},
        )
        self.assertEqual(updated.status_code, 200)

        balanced = self.client.post("/api/v1/budget/zero-balance")
        self.assertEqual(balanced.status_code, 200)
        self.assertTrue(balanced.json()["balanced"])
        self.assertEqual(balanced.json()["summary"]["surplus"], "0")

    def test_create_one_time_expense_defaults_date(self) -> None:
        created = self.client.post(
            "/api/v1/expenses",
            json={
                "name": "Annual fee",
                "amount": 12000,
                "category_id": 4,
                "is_fixed": True,
                "frequency": "one_time",
            },
        )
        self.assertEqual(created.status_code, 201)
        self.assertIsNotNone(created.json()["expense_date"])

    def test_micro_spend_is_automatically_tagged(self) -> None:
        created = self.client.post(
            "/api/v1/expenses",
            json={
                "name": "Coffee subscription",
                "amount": 1800,
                "category_id": 3,
                "is_fixed": False,
                "frequency": "monthly",
            },
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()["is_high_leak"])
        self.assertEqual(created.json()["leak_tag"], "coffee")

    def test_pdf_report(self) -> None:
        report = self.client.get("/api/v1/report/pdf")
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.headers["content-type"], "application/pdf")
        self.assertTrue(report.content.startswith(b"%PDF"))

    def test_budget_save_and_daily_spending(self) -> None:
        saved = self.client.post("/api/v1/budget/save")
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()["month"], date.today().strftime("%Y-%m"))

        categories = self.client.get("/api/v1/categories").json()
        variable = next(
            item
            for category in categories
            for item in category["expenses"]
            if not item["is_fixed"]
        )
        created = self.client.post(
            "/api/v1/transactions",
            json={
                "description": "Lunch",
                "amount": 1200,
                "expense_id": variable["id"],
                "spent_at": date.today().isoformat(),
            },
        )
        self.assertEqual(created.status_code, 201)
        transaction_id = created.json()["id"]

        summary = self.client.get("/api/v1/spending/summary")
        self.assertEqual(summary.status_code, 200)
        self.assertGreaterEqual(summary.json()["transaction_count"], 1)
        self.assertGreaterEqual(float(summary.json()["total_spent"]), 1200)

        deleted = self.client.delete(f"/api/v1/transactions/{transaction_id}")
        self.assertEqual(deleted.status_code, 204)

    def test_budget_lines_are_month_scoped_and_removable(self) -> None:
        future_month = "2099-12"
        created = self.client.post(
            "/api/v1/expenses",
            json={
                "name": "Future subscription",
                "amount": 2500,
                "budget_month": future_month,
                "category_id": 6,
                "is_fixed": True,
                "frequency": "monthly",
            },
        )
        self.assertEqual(created.status_code, 201)
        expense_id = created.json()["id"]

        current_names = {
            item["name"]
            for category in self.client.get("/api/v1/categories").json()
            for item in category["expenses"]
        }
        self.assertNotIn("Future subscription", current_names)

        future_names = {
            item["name"]
            for category in self.client.get(
                "/api/v1/categories", params={"month": future_month}
            ).json()
            for item in category["expenses"]
        }
        self.assertIn("Future subscription", future_names)

        deleted = self.client.delete(f"/api/v1/expenses/{expense_id}")
        self.assertEqual(deleted.status_code, 204)

    def test_running_budget_with_spending_cannot_be_removed(self) -> None:
        created_budget = self.client.post(
            "/api/v1/expenses",
            json={
                "name": "Protected running budget",
                "amount": 5000,
                "category_id": 2,
                "is_fixed": False,
                "frequency": "monthly",
            },
        )
        self.assertEqual(created_budget.status_code, 201)
        expense_id = created_budget.json()["id"]
        transaction = self.client.post(
            "/api/v1/transactions",
            json={
                "description": "Protected purchase",
                "amount": 500,
                "expense_id": expense_id,
                "spent_at": date.today().isoformat(),
            },
        )
        self.assertEqual(transaction.status_code, 201)
        blocked = self.client.delete(f"/api/v1/expenses/{expense_id}")
        self.assertEqual(blocked.status_code, 409)

    def test_category_caps_are_editable_per_month(self) -> None:
        current_month = date.today().strftime("%Y-%m")
        updated = self.client.put(
            "/api/v1/categories/caps",
            json={
                "month": current_month,
                "caps": [{"category_id": 3, "cap_amount": 123456}],
            },
        )
        self.assertEqual(updated.status_code, 200)

        current_categories = self.client.get("/api/v1/categories").json()
        current_cap = next(
            category["cap_amount"]
            for category in current_categories
            if category["id"] == 3
        )
        self.assertEqual(current_cap, "123456.00")

        future_categories = self.client.get(
            "/api/v1/categories", params={"month": "2099-12"}
        ).json()
        future_cap = next(
            category["cap_amount"]
            for category in future_categories
            if category["id"] == 3
        )
        self.assertIsNone(future_cap)

    def test_complete_plan_save_persists_visible_values(self) -> None:
        summary = self.client.get("/api/v1/budget/summary").json()
        categories = self.client.get("/api/v1/categories").json()
        expense = next(
            item
            for category in categories
            for item in category["expenses"]
            if not item["is_fixed"]
        )
        new_amount = 43210
        saved = self.client.put(
            "/api/v1/budget/plan",
            json={
                "month": summary["month"],
                "currency": summary["currency"],
                "monthly_income": summary["total_income"],
                "expenses": [
                    {
                        "expense_id": item["id"],
                        "amount": new_amount if item["id"] == expense["id"] else item["amount"],
                    }
                    for category in categories
                    for item in category["expenses"]
                ],
            },
        )
        self.assertEqual(saved.status_code, 200)
        refreshed = self.client.get("/api/v1/categories").json()
        refreshed_amount = next(
            item["amount"]
            for category in refreshed
            for item in category["expenses"]
            if item["id"] == expense["id"]
        )
        self.assertEqual(refreshed_amount, "43210.00")

    def test_edit_session_can_discard_persisted_changes(self) -> None:
        summary = self.client.get("/api/v1/budget/summary").json()
        categories = self.client.get("/api/v1/categories").json()
        original = next(
            item
            for category in categories
            for item in category["expenses"]
            if item["is_fixed"]
        )
        original_cap = next(
            category["cap_amount"]
            for category in categories
            if category["id"] == 3
        )
        started = self.client.post(
            "/api/v1/budget/edit-session",
            json={"month": summary["month"]},
        )
        self.assertEqual(started.status_code, 200)

        changed = self.client.put(
            "/api/v1/budget/draft",
            json={
                "month": summary["month"],
                "currency": summary["currency"],
                "monthly_income": summary["total_income"],
                "expenses": [
                    {
                        "expense_id": item["id"],
                        "amount": (
                            float(item["amount"]) + 777
                            if item["id"] == original["id"]
                            else item["amount"]
                        ),
                    }
                    for category in categories
                    for item in category["expenses"]
                ],
            },
        )
        self.assertEqual(changed.status_code, 200)
        added = self.client.post(
            "/api/v1/expenses",
            json={
                "name": "Discard me",
                "amount": 500,
                "category_id": 6,
                "is_fixed": True,
                "frequency": "monthly",
            },
        )
        self.assertEqual(added.status_code, 201)
        changed_cap = self.client.put(
            "/api/v1/categories/caps",
            json={
                "month": summary["month"],
                "caps": [{"category_id": 3, "cap_amount": 99999}],
            },
        )
        self.assertEqual(changed_cap.status_code, 200)
        changed_income = self.client.post(
            "/api/v1/budget/income",
            json={
                "monthly_income": float(summary["total_income"]) + 1234,
                "currency": summary["currency"],
            },
        )
        self.assertEqual(changed_income.status_code, 200)

        discarded = self.client.post(
            "/api/v1/budget/discard",
            json={"month": summary["month"]},
        )
        self.assertEqual(discarded.status_code, 200)
        refreshed = self.client.get("/api/v1/categories").json()
        refreshed_items = [
            item for category in refreshed for item in category["expenses"]
        ]
        restored = next(item for item in refreshed_items if item["id"] == original["id"])
        self.assertEqual(restored["amount"], original["amount"])
        self.assertNotIn("Discard me", {item["name"] for item in refreshed_items})
        restored_summary = self.client.get("/api/v1/budget/summary").json()
        self.assertEqual(restored_summary["total_income"], summary["total_income"])
        restored_cap = next(
            category["cap_amount"]
            for category in refreshed
            if category["id"] == 3
        )
        self.assertEqual(restored_cap, original_cap)

    def test_auto_balance_adjusts_variable_budgets_equally(self) -> None:
        summary = self.client.get("/api/v1/budget/summary").json()
        categories = self.client.get("/api/v1/categories").json()
        items = [item for category in categories for item in category["expenses"]]
        variable_items = [item for item in items if not item["is_fixed"]]
        fixed_total = sum(float(item["amount"]) for item in items if item["is_fixed"])
        target_amount = 12000
        current_amount = 10000
        saved = self.client.put(
            "/api/v1/budget/plan",
            json={
                "month": summary["month"],
                "currency": "JPY",
                "monthly_income": fixed_total + len(variable_items) * target_amount,
                "expenses": [
                    {
                        "expense_id": item["id"],
                        "amount": current_amount if not item["is_fixed"] else item["amount"],
                    }
                    for item in items
                ],
            },
        )
        self.assertEqual(saved.status_code, 200)
        balanced = self.client.post("/api/v1/budget/zero-balance")
        self.assertEqual(balanced.status_code, 200)
        self.assertTrue(balanced.json()["balanced"])
        refreshed = self.client.get("/api/v1/categories").json()
        refreshed_variables = [
            float(item["amount"])
            for category in refreshed
            for item in category["expenses"]
            if not item["is_fixed"]
        ]
        self.assertTrue(
            all(amount == target_amount for amount in refreshed_variables)
        )


if __name__ == "__main__":
    unittest.main()

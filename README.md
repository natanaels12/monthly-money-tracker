# Zero-Based Budget

A responsive monthly budgeting dashboard for JPY and USD. The app combines a
React and TypeScript frontend with a FastAPI and SQLite backend. It includes
fixed and variable expense planning, dated one-time costs, category caps,
high-leak spending analysis, proportional zero-based balancing, and PDF audit
reports. A separate daily spending dashboard records actual purchases against
user-defined variable running budgets.

Every running and fixed budget line belongs to one budget month. A new
installation starts without financial figures and includes only a zero-valued
starter line. Add running and fixed budgets from the monthly planner after
entering your income.

## Run with Docker

Docker Compose runs the production frontend and API together. The backend
bind-mounts `backend\budget.db`, so Docker and a locally started Python backend
use the same SQLite database file.

```powershell
docker compose up --build
```

Open the dashboard at `http://localhost:5173`. FastAPI documentation remains
available at `http://localhost:8000/docs`.

Stop the containers without deleting budget data:

```powershell
docker compose down
```

To reset the app, stop the containers and delete `backend\budget.db`. The app
creates a fresh database the next time the local or Docker backend starts.

```powershell
docker compose down
Remove-Item backend\budget.db
```

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer

## 1. Start the API

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

The API is available at `http://localhost:8000`. Interactive API documentation
is available at `http://localhost:8000/docs`. The SQLite database is created at
`backend\budget.db`. New databases contain empty category groups and a
zero-valued starter budget; no personal income, expense, or transaction figures
are included in the source code.

To store the database elsewhere, set `BUDGET_DATABASE_URL` before starting
Uvicorn:

```powershell
$env:BUDGET_DATABASE_URL = "sqlite:///C:/data/budget.db"
```

## 2. Start the frontend

Open a second terminal at the project root:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend uses `http://localhost:8000` by
default. To use another API URL, copy `.env.example` to `.env` and change
`VITE_API_URL`.

## Production build

```powershell
npm run build
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Serve the generated `dist` directory with a static web server and set
`VITE_API_URL` to the public API origin before building.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/budget/summary` | Current income, allocations, category totals, and cash flow |
| `POST` | `/api/v1/budget/income` | Update monthly take-home income, currency, or budget month |
| `POST` | `/api/v1/budget/save` | Save or replace the current monthly plan snapshot |
| `PUT` | `/api/v1/budget/plan` | Atomically save every visible value in the monthly plan |
| `PUT` | `/api/v1/budget/draft` | Persist in-progress values without closing the edit session |
| `GET` | `/api/v1/budget/saved` | List saved monthly plan snapshots |
| `GET` | `/api/v1/categories` | Category groups and their planned expense items |
| `PUT` | `/api/v1/categories/caps` | Set or clear category caps for a specific month |
| `POST` | `/api/v1/expenses` | Create a monthly or one-time expense target |
| `PUT` | `/api/v1/expenses/{id}` | Update an expense target |
| `DELETE` | `/api/v1/expenses/{id}` | Remove a monthly budget line when it has no spending history |
| `POST` | `/api/v1/budget/zero-balance` | Proportionally resize active variable targets to reach zero |
| `GET` | `/api/v1/spending/summary` | Actual spending progress against variable targets |
| `GET` | `/api/v1/transactions` | List daily spending entries for the budget month |
| `POST` | `/api/v1/transactions` | Register a daily purchase against a running budget |
| `DELETE` | `/api/v1/transactions/{id}` | Remove an incorrect daily spending entry |
| `GET` | `/api/v1/report/pdf` | Download the current monthly audit report |

The auto-balancer preserves fixed expenses and proportionally reallocates all
active variable targets. It returns a clear validation error when fixed costs
alone exceed income, because a zero balance cannot be reached by reducing
variable spending.

## Run checks

With the Python environment active and frontend packages installed:

```powershell
python -m pip install -r backend\requirements-dev.txt
python -m unittest backend.tests.test_api
npm run lint
npm run build
```

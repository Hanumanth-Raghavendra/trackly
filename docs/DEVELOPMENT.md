# Developing Trackly locally

Two ways to run it: **Docker** (one command, nothing else to install) or **natively** (faster
feedback while you code). Commands are given for **Windows PowerShell** and for **bash**
(Linux, macOS, WSL).

## Option A: Docker (simplest)

Needs Docker Desktop. In the repo folder, for example `C:\Users\<you>\trackly`:

```powershell
docker compose up --build
```

| What | URL |
|---|---|
| Web app | <http://localhost:3000> |
| core-api Swagger UI | <http://localhost:8080/swagger-ui.html> |
| insights health | <http://localhost:4000/health> |
| Postgres | `localhost:5433` (user `postgres`, password `postgres`, database `trackly`) |

Postgres is published on **5433** so it doesn't clash with a Postgres already installed on 5432.
Stop with `Ctrl+C`; `docker compose down -v` also deletes the data.

## Option B: native

Needs **JDK 21**, **Maven 3.9+**, **Node 22+** and **PostgreSQL** (any recent version).

### 1. Get the code and create the databases

```powershell
cd C:\Users\<you>
git clone https://github.com/Hanumanth-Raghavendra/trackly.git
cd C:\Users\<you>\trackly
```

Create three databases: one to run the app, two for the test suites. If `psql` isn't on your
PATH, use its full path. Change `18` to your installed version:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE trackly;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE trackly_test;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE insights_test;"
```

bash: `psql -U postgres -c "CREATE DATABASE trackly;"` (and the same for the other two).

### 2. Start the three apps (three terminals)

Replace `<password>` with your Postgres password in every command below.

**Terminal 1: core-api** (port 8080, first start takes ~20 s):

```powershell
cd C:\Users\<you>\trackly\services\core-api
$env:DATABASE_URL = "postgres://postgres:<password>@localhost:5432/trackly"
$env:INSIGHTS_URL = "http://localhost:4000"
mvn spring-boot:run
```

**Terminal 2: insights** (port 4000, restarts on save):

```powershell
cd C:\Users\<you>\trackly\services\insights
npm ci
$env:DATABASE_URL = "postgres://postgres:<password>@localhost:5432/trackly"
npm run dev
```

**Terminal 3: web** (port 5173, hot reload; Vite proxies `/api` and `/socket.io` to the two
services, exactly like Vercel does in production):

```powershell
cd C:\Users\<you>\trackly\apps\web
npm ci
npm run dev
```

Open <http://localhost:5173> and click **Try the live demo**.

bash users can do all of this in one go with `scripts/dev-stack.sh` (it builds everything and
serves the production web build on <http://127.0.0.1:4173>; `scripts/dev-stack.sh stop` stops it).

## Running the tests

The integration tests **drop and recreate schemas** in their test databases. Never point them at
a database you care about.

**core-api** (50 tests: unit + integration against real Postgres):

```powershell
cd C:\Users\<you>\trackly\services\core-api
$env:JDBC_DATABASE_URL = "jdbc:postgresql://localhost:5432/trackly_test"
$env:DB_USERNAME = "postgres"
$env:DB_PASSWORD = "<password>"
mvn verify
```

Unit tests only, no database needed: `mvn test -Punit`.

**insights** (65 tests):

```powershell
cd C:\Users\<you>\trackly\services\insights
$env:TEST_DATABASE_URL = "postgres://postgres:<password>@localhost:5432/insights_test"
npm test
npm run lint
npm run typecheck
```

**web** (unit tests, lint, types, production build):

```powershell
cd C:\Users\<you>\trackly\apps\web
npm test
npm run lint
npm run typecheck
npm run build
```

**End-to-end** (Playwright, desktop and mobile viewports). Start the stack first (option A or B),
then:

```powershell
cd C:\Users\<you>\trackly\apps\web
npx playwright install chromium
$env:E2E_BASE_URL = "http://localhost:5173"
npm run e2e
```

Use `http://localhost:3000` instead if you started the stack with Docker.

## Configuration reference

Every setting is an environment variable with a safe local default. The full list, with
explanations, is in [`.env.example`](../.env.example) at the repo root.

## Handy URLs while developing

| What | URL |
|---|---|
| OpenAPI JSON | <http://localhost:8080/v3/api-docs> |
| Swagger UI (click **Authorize** and paste an access token) | <http://localhost:8080/swagger-ui.html> |
| insights feature flags (AI, push) | <http://localhost:4000/api/v1/insights/config> |
| Outbox consumer state | <http://localhost:4000/health> |

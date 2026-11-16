# Snack Counter Automation

Automates the office snack-counter refill process for the Oslo and Bengaluru
offices: a refill moves from **empty → reimbursed**, exactly one volunteer owns
it at a time, who buys is chosen fairly, and spending stays within budget with
a correct combined monthly report in INR.

**Stack:** Node.js + TypeScript, Sequelize, MySQL. Style: functional (factory
functions + arrow functions, no `class` in our own code; Sequelize models use
`sequelize.define`).

## Project layout

```
src/
  config/database.ts        MySQL/Sequelize config (reads .env)
  models/db.ts              shared Sequelize instance
  models/index.ts           models (sequelize.define) + associations
  migrations/0001-...       Sequelize migration creating the MySQL schema
  migrate.ts                Umzug runner (up / down / status)
  seed.ts                   seed offices + volunteers into MySQL
  core/
    types.ts                domain enums & interfaces
    util.ts                 money rounding, month key, timeouts
    errors.ts               error factories
    AssignmentPolicy.ts     fair selection of who buys
    RefillService.ts        the refill lifecycle, budget check, monthly report
  ports/                    interfaces (Repository, ChatPort, HrPort, FxPort, Clock)
  adapters/                 simulated chat/HR/FX/clock + InMemory + Sequelize repos
  app/bootstrap.ts          wiring (in-memory app for tests/demo, production app)
  app/demo.ts               end-to-end demo against in-memory adapters
tests/                      Jest tests proving the rules
```

## Setup (once Node is installed)

```bash
npm install
cp .env.example .env        # then edit DB credentials
```

Create the MySQL database (the migration creates tables, not the database):

```sql
CREATE DATABASE snack_counter CHARACTER SET utf8mb4;
```

Run migrations + seed against MySQL:

```bash
npm run migrate            # up
npm run migrate:status
npm run seed
npm run migrate:undo       # rollback the last migration
```

Run the tests (no MySQL needed — they use the in-memory repository):

```bash
npm test
```

Run the in-memory demo:

```bash
npm run demo
```

Build:

```bash
npm run build              # outputs dist/
```

## The rules the tests prove

`tests/double-commit.test.ts` — two people cannot both commit to the same
refill (atomic ownership via compare-and-set).

`tests/reassign-on-timeout.test.ts` — a refill nobody completes is handed to
someone else on timeout.

`tests/budget-and-totals.test.ts` — monthly budgets and totals are correct
across both currencies (NOK and INR), including the combined INR total and
over-budget flagging.

`tests/fairness.test.ts` — the volunteer with the fewest refills (currently at
the office) is chosen, with remote/holiday skipped and visitors allowed.

`tests/full-lifecycle.test.ts` — a refill moves empty → assigned → committed →
purchased → approved → reimbursed.

## Why two repositories?

The core logic depends only on the `Repository` port, so the same `RefillService`
runs against:

- **`InMemoryRepository`** — deterministic, no infrastructure; used by the tests.
- **`SequelizeRepository`** — real MySQL; atomic transitions use
  `UPDATE ... WHERE status = ? AND owner = ?` and check the affected row count,
  plus a transaction for the purchase (which also bumps the fairness counters).

The chat tool and HR system are simulated stand-ins (`SimulatedChat`,
`SimulatedHr`) because they are external systems; swap in real adapters for
production via `createProductionApp({ chat, hr })`.

## Reporting currency

INR, per the design. Per-office budgets are checked in local currency; only the
combined monthly report converts every refill to INR using the FX snapshot
stored at purchase time (`fx_rate`, default NOK→INR = 8.0).

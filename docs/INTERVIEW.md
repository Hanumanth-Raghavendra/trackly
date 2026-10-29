# Trackly: interview guide

How Trackly works, why it's built this way, and what interviewers are likely to ask. Before an
interview, read this once and open the files in [Where to look in the code](#where-to-look-in-the-code).
Interviewers dig into what you claim, so be able to explain every line on your resume.

## The 30-second pitch

> Trackly is a productivity app (tasks, habits and focus sessions) that also analyses your own
> behaviour: when you're most productive, which habits you tend to skip on which days, and how
> close to deadlines you finish. It's two services: a **Spring Boot** API that owns the data and
> a **Node** service that turns the event stream into analytics, achievements and live updates.
> They're connected by a **transactional outbox** in Postgres. The React front end ships as a web
> app, a PWA and an Android app from one codebase, and the whole thing runs on free tiers with CI
> gating every deploy.

## Resume bullets (pick 2–3)

- Built **Trackly**, a full-stack productivity platform (**React 19, Spring Boot 4 / Java 21,
  Node.js, PostgreSQL**) with tasks, habits, focus sessions and an analytics engine that finds
  personal productivity patterns; shipped as web app, PWA and Android app (Capacitor).
- Designed an **event-driven architecture** with a transactional outbox and an idempotent consumer
  (advisory-lock leader, dead letters, replayable read model), with real-time sync over **WebSockets**.
- Implemented **JWT auth with rotating refresh tokens** and token-family theft detection;
  **120+ automated tests** (JUnit/MockMvc, Vitest, Playwright e2e) in **GitHub Actions CI** gating
  deploys to Render and Vercel.

## How one click flows through the system

**"Complete a task"**, end to end:

1. **Browser.** `TaskCheckbox` updates the cache optimistically (TanStack Query) and calls
   `PATCH /api/v1/tasks/{id}` with `{"status":"DONE"}` and the access token in `Authorization`.
2. **Vercel** rewrites `/api/*` to core-api on Render, so the browser only talks to one origin.
3. **core-api.** `JwtAuthenticationFilter` verifies the HS256 token; no session, no DB lookup.
4. `TaskService.patch` runs in **one transaction**: marks the task done, spawns the next occurrence
   if it repeats, and `OutboxPublisher` inserts `TASK_COMPLETED` into `core.outbox_events`.
   `Propagation.MANDATORY` makes it impossible to publish an event outside a transaction.
5. **After commit**, `OutboxNudger` POSTs `/internal/outbox/nudge` to insights (async, coalesced,
   best effort; polling is the fallback).
6. **insights.** `OutboxConsumer.pollOnce` takes an advisory lock, reads events after its offset,
   applies each in a savepoint (`handlers.ts`): upsert the task projection, award XP via a ledger
   keyed `task:<id>` (so a replay can't double-count), recompute level and achievements, then
   commits **offset + projections together**.
7. **After that commit**, it emits `sync`, `xp` and maybe `achievement` over Socket.IO to the
   user's room. Every open tab and device refetches exactly the queries that changed and shows
   "+15 XP".

## Key design decisions

| Decision | Why | Trade-off / at scale |
|---|---|---|
| Two services instead of one | core-api is the system of record (Java, where correctness matters); insights is read-heavy analytics + realtime (Node's event loop suits sockets). Separate concerns, separately deployable. | More moving parts. With one team I'd start as a modular monolith; this split shows the patterns. |
| **Transactional outbox**, not Kafka | Guarantees an event exists if and only if the change committed, with no dual-write problem. No broker to run on a free tier. | Polling adds latency, so a nudge covers it. At scale: Debezium CDC from the outbox into Kafka, multiple consumer groups. |
| Read model in its own schema (CQRS) | Analytics queries never touch core's tables; insights could move to its own DB tomorrow. Rebuildable by resetting the offset. | Eventual consistency (usually under a second). Shared Postgres instance only because of the free tier. |
| Full snapshots in events | Consumers upsert, so handlers are idempotent and order-tolerant within an aggregate. | Bigger payloads; fine at this size. |
| HS256 JWT shared by both services | Insights authenticates requests without calling core. | A shared secret means both can mint tokens. With third-party verifiers: RS256 + a JWKS endpoint. |
| Refresh tokens: opaque, hashed, rotated, family revocation | A stolen refresh token is detected the moment either party uses an old one; a DB leak exposes only hashes. A 20 s grace window stops false alarms when a response is lost mid-reload. | One DB write per refresh (cheap). |
| Cookie on web, body token on native | httpOnly + SameSite=Strict + path-scoped cookie is the safest browser storage; a WebView on `https://localhost` can't rely on third-party cookies. | Two code paths, one flag (`X-Client: native`). |
| Same-origin API via Vercel rewrites | Keeps the refresh cookie first-party (Safari blocks third-party cookies). | WebSockets can't go through the rewrite, so the socket connects to insights directly with the token in the handshake. |
| Rule-based coach, optional AI | Deterministic, free, testable insights; AI only rewrites the summary. Provider is configuration (`AI_PROVIDER`). | LLM quality varies; rate-limited to 30/hour per user. |
| Free-tier engineering | Render sleeps after 15 min idle; Neon allows 100 CU-hours a month. | CDS archive for faster JVM start, landing page pre-warms services, slow idle polling, hourly cron for reminders, on-device reminders on Android. |

## Deep dives

### Exactly-once effects (the most likely deep question)

"Exactly-once delivery" doesn't exist; Trackly makes the **effects** exactly-once:

- **At-least-once reading:** the offset only moves when the batch commits. A crash replays events.
- **Idempotent writes:** every handler is an `INSERT … ON CONFLICT DO UPDATE` keyed by entity id;
  XP is a ledger with primary key `(user_id, source)`, so replaying `TASK_COMPLETED` awards nothing
  new, and `TASK_REOPENED` deletes exactly the XP that task earned.
- **Atomicity:** offset + projections + XP + achievements commit in one transaction.
- **No side effects before commit:** socket messages, notifications and pushes are collected and
  sent after the commit, so a rolled-back batch never toasts "+15 XP".
- **Poison messages:** each event runs in a `SAVEPOINT`; a failure rolls back that event only and
  writes it to `insights.dead_letters`, and the stream keeps moving.
- **Single consumer:** `pg_try_advisory_xact_lock`. A second instance simply skips the batch.
  Transaction-scoped, so it also works behind PgBouncer.

### The productivity score

`services/insights/src/domain/score.ts`. The base weights are tasks 35%, habits 35%, focus 20%
and on-time 10%. Components with nothing to measure drop out and the rest are re-normalised, so a
new user without habits isn't punished. The task target is what was due today, clamped to 3–8 so
an empty calendar doesn't give 100. Each component reports its points and a sentence, which is why
the UI can explain every point.

### Streaks and timezones

A "day" is always the user's local day. core-api uses `ZoneId` per request (from the JWT `tz`
claim); insights uses `AT TIME ZONE` in SQL. Legacy zone names that Chrome still sends
(`Asia/Calcutta`) are normalised in both services. Streak rules (`HabitStreakCalculator`): only
*scheduled* days count, today never breaks a streak until it's over, weekly habits count weeks
that met their target, and a freeze check-in counts as done. Reminders work out which day a
reminder belonged to, so 23:45 reminders still work after midnight.

### Front-end data flow

- **TanStack Query** is the cache; server state never lives in component state.
- **Optimistic updates** for checkboxes and drags, rolled back on error.
- **Realtime = cache invalidation:** the socket says *what* changed (`entities: ['tasks','insights']`)
  and the client refetches those queries. There's no second source of truth to keep consistent.
- **Single-flight token refresh:** parallel 401s cause one refresh; the Web Locks API stops two
  tabs from rotating the same cookie.
- **Offline quick-capture:** if the network fails, the task is queued in localStorage and flushed
  when the browser comes back online.
- The **quick-add parser** (`lib/quickAdd.ts`) runs entirely on the device: chrono-node for dates
  plus regexes for `#tags`, `!priority`, `@project`, `every week` and `~45m`. It's unit-tested.
- The **focus timer** stores *when* it started, not tick counts, so reloads, background tabs and
  sleeping phones can't make it drift.

## Questions you may get, with short answers

**Java / Spring**

- *Why `@Transactional(propagation = MANDATORY)` on the outbox publisher?* So it fails fast if
  someone calls it outside a business transaction: the event must commit with the change.
- *JPA or JDBC?* JPA for aggregates (entities, dirty checking); `JdbcTemplate` for the outbox
  insert and the demo seeder's ~1,000-row batch, where JPA's per-entity overhead buys nothing.
- *Why do entities assign their own UUIDs?* The id is known before the INSERT, so the outbox event
  can reference it in the same transaction; implementing `Persistable` avoids a SELECT before insert.
- *How are errors returned?* `GlobalExceptionHandler` turns everything into RFC 9457 problem JSON
  with a stable `code` (`EMAIL_TAKEN`, `VALIDATION_FAILED`) that clients switch on.
- *PATCH semantics?* JSON Merge Patch (RFC 7396): absent = unchanged, `null` = clear. That's why
  `TaskService.patch` takes a `Map` and not a record (records can't tell absent from null).
- *Virtual threads?* `spring.threads.virtual.enabled=true`: blocking JDBC calls don't pin a
  platform thread, which helps a tiny 512 MB instance.

**Databases**

- *Indexes?* Composite `(user_id, status)`, `(user_id, due_at)`; unique `(habit_id, day)` makes
  check-ins idempotent; `lower(email)` unique index for case-insensitive emails.
- *Migrations?* Flyway (core) and a small forward-only runner with an advisory lock (insights).
  Each service owns its schema.
- *Why not one database per service?* Free-tier constraint; the schemas are fully separate, and
  insights never reads core's tables except the outbox.

**System design / scaling to 1 million users**

- Stateless services, so scale horizontally behind a load balancer.
- Rate limiter moves from in-memory to Redis.
- Socket.IO gets the Redis adapter so rooms span instances.
- The outbox goes to Debezium + Kafka, with partitioning by `user_id` to keep per-user ordering.
- Analytics gets precomputed daily rollups instead of on-read aggregation.
- Read replicas for insights' queries.

**Security**

- Passwords: BCrypt cost 10, plus constant-time login (a dummy hash for unknown emails) against
  user enumeration.
- Brute force: per-IP rate limits on login, register, demo and refresh.
- XSS: React escapes by default; colours are validated as `#rrggbb` (`Colors.orDefault`) before
  being used in styles.
- CSRF: there's no cookie-authenticated state change except refresh, which is
  `SameSite=Strict` and path-scoped to `/api/v1/auth`.
- CORS: an explicit allow-list plus the native app's origins.
- Secrets: generated by Render, never in Git; Android signing keys only in GitHub secrets.

**Frontend**

- *How do you avoid stale data across devices?* Socket `sync` events invalidate the affected
  queries; when a hidden tab becomes visible again it reconnects and refetches.
- *Bundle size?* Route-level lazy loading plus manual chunks (charts, drag and drop, realtime,
  date parsing) so the first load skips Recharts and chrono.

**Testing / DevOps**

- Unit tests for pure logic (streaks, recurrence, score, parser); integration tests against real
  Postgres (MockMvc, supertest); Playwright journeys on desktop and a Pixel-sized viewport.
- CI runs all of it, plus Docker builds; Render deploys only commits whose checks pass.
- *Why real Postgres in tests and not H2?* Arrays, JSONB, `AT TIME ZONE` and advisory locks behave
  differently or don't exist in H2. Testing against the real thing catches real bugs.

**Behavioural**

- *Hardest bug?* Refresh-token reuse detection logged users out when they reloaded mid-refresh:
  the server rotated the token, but the browser never got the new cookie. The fix was a short
  grace window that only applies if the replacement was never used. Real theft, where the chain
  has moved on, still revokes everything. There's an integration test for both cases.
- *Another one:* reminder windows compared times of day, so reminders set near midnight never
  fired. The fix computes which day a reminder belongs to, with a test that crosses midnight.
- *What would you do next?* FCM push for the Android app, team/shared projects, and precomputed
  analytics rollups.

## Numbers to remember

| | |
|---|---|
| Tests | core-api 50, insights 65, web 8 unit + 3 e2e journeys on 2 devices |
| Event types | 19 (user, task, habit, focus, goal) |
| Achievements | 17 |
| Access token / refresh token | 15 minutes / 30 days, rotated on every use |
| Demo account | 8 weeks of generated history, deleted after 24 h |
| Free-tier budget | Render 750 h/month, Neon 100 CU-h/month, sleeps after 15 / 5 min idle |

## Where to look in the code

| Topic | Files |
|---|---|
| Outbox write | `services/core-api/.../outbox/OutboxPublisher.java`, `OutboxNudger.java` |
| Outbox read | `services/insights/src/consumer/outboxConsumer.ts`, `handlers.ts` |
| Auth | `.../auth/AuthController.java`, `RefreshTokenService.java`, `.../security/JwtService.java`, `apps/web/src/api/client.ts` |
| Tasks | `.../task/TaskService.java`, `RecurrenceCalculator.java` |
| Streaks | `.../habit/HabitStreakCalculator.java`, `services/insights/src/domain/schedule.ts` |
| Score and coach | `services/insights/src/domain/score.ts`, `insights.ts`, `analytics.ts`, `review.ts` |
| Gamification | `services/insights/src/domain/gamification.ts`, `consumer/gamificationService.ts` |
| Reminders | `services/insights/src/notifications/reminders.ts` |
| Realtime | `services/insights/src/realtime.ts`, `apps/web/src/hooks/useRealtime.ts` |
| Quick add | `apps/web/src/lib/quickAdd.ts`, `apps/web/test/quickAdd.test.ts` |
| Mobile | `apps/web/src/lib/native.ts`, `apps/web/src/lib/platform.ts`, `apps/web/capacitor.config.ts` |
| Infra | `render.yaml`, `apps/web/vercel.json`, `docker-compose.yml`, `.github/workflows/` |

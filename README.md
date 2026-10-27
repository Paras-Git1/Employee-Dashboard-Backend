# Employee Task Dashboard

One place for each employee to see their work from two systems (a CRM and a Helpdesk),
merged into a single list, prioritized by deadline and urgency, behind a proper login.
Admins create, assign, edit and delete tasks; employees mark their own tasks
To do / Working on it / Completed. Changes are saved in PostgreSQL and pushed live to every open dashboard.

## Project layout

```
task-dashboard/
├── frontend/                 React + Vite app (port 5173)
├── backend/
│   ├── api-gateway/          Express API: tasks, employees, scoring, caching (port 3001)
│   ├── auth-service/         Express login service: bcrypt passwords, JWT session cookie (port 4003)
│   ├── crm-mock/             CRM REST API (CRUD) + task detail pages, data in taskdash_crm (port 4001)
│   └── helpdesk-mock/        Helpdesk REST API (CRUD) + ticket detail pages, data in taskdash_helpdesk (port 4002)
├── database/                 Private PostgreSQL instance, migrations and seed data (port 5434)
└── setup-env.js              Creates every .env from its .env.example
```

Frontend, each backend service and the database are separate packages with their own
`package.json` and `.env`. They talk to each other only over HTTP / the database URL,
so each one can later be deployed on a different machine by changing `.env` values.

## Requirements

- Node.js 22 or newer
- PostgreSQL 16+ binaries (`brew install postgresql@18`). The project starts its **own**
  Postgres instance from these binaries, with data in `database/.pgdata`, on port 5434.
  It does not touch any other Postgres server or database on the machine.

## First-time setup

```bash
cd task-dashboard
npm install          # installs all packages (npm workspaces)
npm run setup        # creates .env files, initialises the database, runs migrations + seeds
```

## Run

```bash
npm run dev          # starts the database, the 4 backend services and the frontend
```

Open http://localhost:5173 and sign in.

| Login | Password | Access |
|---|---|---|
| `admin@example.com` | `admin123` | Admin / manager (Amira Hassan): sees everyone, can filter by employee |
| `employee@example.com` | `employee123` | Employee (Priya Raman): sees only their own tasks |

Other seeded employees: daniel.okafor, lucas.moreau, sofia.lindqvist, kenji.watanabe (all `@example.com`, password `Password123!`).
These are local demo credentials only; change them before any real deployment.

Run the parts separately if you prefer:

```bash
npm run db:start        # database only
npm run dev:backend     # database + 4 backend services
npm run dev:frontend    # frontend only
npm run db:stop         # stop the database
```

## Ports

| Service | Port | Setting |
|---|---|---|
| Frontend | 5173 | `frontend/.env` → `VITE_PORT` |
| API gateway | 3001 | `backend/api-gateway/.env` → `PORT` (3000 was already in use on this machine) |
| Auth service | 4003 | `backend/auth-service/.env` → `PORT` |
| CRM mock | 4001 | `backend/crm-mock/.env` → `PORT` |
| Helpdesk mock | 4002 | `backend/helpdesk-mock/.env` → `PORT` |
| PostgreSQL | 5434 | `database/.env` → `PG_PORT` |

If you change a port, also update the URLs that point at it (`VITE_API_URL`, `VITE_AUTH_URL`,
`CORS_ORIGIN`, `CRM_BASE_URL`, `HELPDESK_BASE_URL`, `DATABASE_URL`).

## What each role can do

| Action | Admin | Employee |
|---|---|---|
| View tasks | Everyone's (filter by employee) | Own only |
| Create and assign a task (CRM task or Helpdesk ticket) | ✅ | ❌ |
| Edit title, assignee, deadline, urgency / account | ✅ | ❌ |
| Change status: To do / Working on it / Completed | ✅ any task | ✅ own tasks |
| Delete | ✅ (with confirmation) | ❌ |

The API enforces these rules (403 otherwise), not just the screen.

## Databases

| Database | Table | Owned by |
|---|---|---|
| `taskdash_auth` | `users` (logins, bcrypt hashes) | auth-service |
| `taskdash_api` | `employees` | api-gateway |
| `taskdash_crm` | `crm_tasks` | crm-mock |
| `taskdash_helpdesk` | `helpdesk_tickets` | helpdesk-mock |

The sample tasks in `database/seeds/` are loaded once on setup, with dates shifted to the day you
run it. After that, all changes are real and persist across restarts.

## Live updates

The dashboard keeps one Server-Sent Events connection open to `GET /api/events`. Whenever a task
is created, updated, completed, reassigned or deleted through the API, the gateway pushes the change
immediately:

- Admins see every change, with a notice such as *Priya Raman completed "VPN access failing…"*.
- Employees only receive changes to their own tasks, such as *New task assigned to you: "…"*.

A slow background refresh (every 2 minutes) is a safety net for dropped connections or changes made
directly in a source system. The green "Live" dot above the task list shows the connection state.

## How it works

1. The browser signs in at the auth service (`POST /auth/login`). The password is checked
   against a bcrypt hash in the `taskdash_auth` database, and the service sets an httpOnly
   session cookie containing a signed JWT. Failed logins are rate limited.
2. The frontend calls the API gateway (`GET /api/tasks`) directly, with the cookie. The gateway
   verifies the JWT with the same `JWT_SECRET` the auth service signed it with.
3. The gateway calls the CRM and Helpdesk in parallel with `Promise.allSettled` and a 3 s
   timeout each, converts both formats into one task shape, matches tasks to employees by
   email (`taskdash_api` database), scores, filters and sorts them.
4. Every card links to the task's detail page in its source system (opens in a new tab).

Access rules: managers can see everyone's tasks and filter by employee. Employees only ever
get their own tasks (the API enforces this, returning 403 for anyone else's).

### Priority score

Deadline: overdue +50, within 24 h +40, within 3 days +25, within 7 days +10, otherwise 0.
Urgency: Helpdesk 1–4 gives +10/+20/+30/+40; CRM has no urgency field and gets +15.
Labels: 70+ critical, 45–69 high, 25–44 medium, below 25 low. Done tasks go to the bottom
and get no deadline points (a finished late task is not "critical").

### API

`GET /api/tasks?employee=<id>&status=<open|in_progress|done>` returns
`{ tasks, errors, sources, generatedAt }`.

| Code | When |
|---|---|
| 200 | Success, including partial success (one source failed, listed in `errors`) |
| 400 | Invalid `status` or non-numeric `employee` |
| 401 | Not signed in or session expired |
| 403 | An employee asked for someone else's tasks |
| 502 | Both sources failed (empty `tasks`, two `errors`) |

`GET /api/employees` returns the employee list for the filter (managers) or just yourself (employees).

| Method | Path | Who | Body |
|---|---|---|---|
| POST | `/api/tasks` | Admin | `{ source: "crm"\|"helpdesk", title, employeeId, deadline, status?, urgency (helpdesk), context (crm account)? }` |
| PATCH | `/api/tasks/:taskKey` | Admin: any field. Employee: `{ status }` on own task | any subset of the fields above except `source` |
| DELETE | `/api/tasks/:taskKey` | Admin | none |
| GET | `/api/events` | Signed in | Server-Sent Events stream of task changes |

Writes go through the gateway to the owning system (CRM or Helpdesk), which saves them to its
database. If that system is down, the write returns 502 with "Your change was not saved".

## Demonstrating failures

Each mock supports `FAIL_MODE`: `off`, `error` (HTTP 500), `slow` (5 s delay, longer than the
3 s timeout) or `malformed` (adds a broken record that is skipped and logged).

Set it in `backend/crm-mock/.env` or `backend/helpdesk-mock/.env` (restart), or switch it live:

```bash
curl -X PUT localhost:4001/__control/fail-mode -H 'content-type: application/json' -d '{"mode":"error"}'
curl -X PUT localhost:4002/__control/fail-mode -H 'content-type: application/json' -d '{"mode":"slow"}'
# back to normal
curl -X PUT localhost:4001/__control/fail-mode -H 'content-type: application/json' -d '{"mode":"off"}'
```

Successful source responses are cached for 45 s (`CACHE_TTL_SECONDS`), so a live switch shows
on the dashboard once the cache expires. Set `CACHE_TTL_SECONDS=0` in
`backend/api-gateway/.env` to see changes immediately.

- One source down → tasks from the other source plus a warning banner, and a red dot next to that source in the sidebar.
- Both down → full error state with a "Try again" button.

## Tests

```bash
npm test
```

- api-gateway: scoring rules for every band, worked examples, status mapping, both normalizers,
  HTTP client (timeout, HTTP error, bad JSON, unreachable), and the API routes (no filters,
  each filter, both together, invalid params, one source down, both down, malformed records,
  auth, access rules, CORS, caching).
- auth-service: login success and failure, input validation, lockout, `/auth/me`, logout.
- frontend: loading, empty, partial-error and full-error states, safe task links,
  refetch on filter change, 400/401 handling, card actions per role, the task form, live notices.
- crm-mock / helpdesk-mock: list, create, update, delete, validation and failure simulation.
- api-gateway also covers create/edit/delete permissions, payload mapping to each system,
  source outages during writes, and the live event stream.

## Deploying parts separately (later)

- Frontend: `npm run build:frontend`, then host `frontend/dist` anywhere, with `VITE_API_URL` and
  `VITE_AUTH_URL` set to the deployed backend URLs at build time.
- Backend services: set `CORS_ORIGIN` to the frontend's URL. If the frontend and backend are on
  different sites, set `COOKIE_SAMESITE=none` (requires HTTPS) in the auth service, and
  `COOKIE_DOMAIN` if the API runs on a sibling subdomain.
- Database: point `DATABASE_URL` (services) and `AUTH_DATABASE_URL` / `API_DATABASE_URL`
  (`database/.env`) at any Postgres server, then run `npm run db:migrate`.
- Scaling: the services are stateless; swap the in-memory cache and login limiter for Redis
  when running several instances.

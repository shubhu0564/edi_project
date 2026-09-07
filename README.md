# ResolveX
### MMCOE Hostel Grievance Portal

<p align="center">
  <img src="logo.png" alt="ResolveX logo" width="120" />
</p>

<p align="center">
  A role-based hostel grievance management system with SLA tracking,
  automated escalation, notifications, and Warden-level escalation management.
</p>

<p align="center">
  <a href="https://github.com/JalajaUtekar/Hostel-Grievance-Portal-with-SLA-and-Escalation">
    GitHub Repository
  </a>
  ·
  <a href="LICENSE">MIT License</a>
</p>
---

## Overview

ResolveX is a web-based hostel grievance and complaint management portal for MMCOE
hostels. It manages the full lifecycle of a complaint — from submission by a
student, through assignment to maintenance staff, to resolution — with
**role-based workflows**, **priority-driven SLA tracking**, **automatic escalation**
when an SLA deadline is breached, **persisted notifications**, and a dedicated
**Warden escalation-management** dashboard.

The goal is simple: a hostel complaint should never be registered and then
forgotten. Every complaint gets a priority, an assigned responsibility, a tracked
status, a server-calculated SLA deadline, and — if that deadline passes without a
resolution — an escalation to the appropriate authority.

The system is a monolithic Express backend (organised into controllers and
services), a React single-page frontend, and MongoDB for persistence.

---

## Key Features

| Area | What is implemented |
|------|--------------------|
| **Authentication** | Email/password registration and login, bcrypt password hashing, JWT bearer tokens, `GET /api/auth/me`, password change |
| **Role-based access** | Four roles — `student`, `maintenance`, `warden`, `admin` — enforced by `protect` + `authorize(...)` middleware on every protected route, plus role-scoped React routes |
| **Student complaint submission & tracking** | Students submit complaints (category, title, description, priority, room number), view only their own complaints, and track status and timeline |
| **Maintenance work management** | Maintenance staff see tasks assigned to them, add progress notes, set estimated completion, move a task through `assigned → in_progress → completed`; completing a task resolves the linked complaint |
| **Admin complaint management** | Admins view/search/filter all complaints, assign maintenance staff, update status, adjust priority, add admin notes, manage students and rooms, and view KPI statistics |
| **Warden escalation management** | Wardens see only complaints escalated to them, view full escalation history, and acknowledge / resolve escalations |
| **Priority levels** | `low`, `medium`, `high`, `urgent` (defaults to `medium`) |
| **SLA deadlines** | Calculated server-side at creation time from a centralized SLA matrix |
| **SLA compliance tracking** | `resolvedWithinSla` computed server-side on resolution; SLA-compliance KPI on the admin dashboard |
| **Automatic escalation** | An in-process scheduler periodically detects SLA-breached, unresolved complaints and escalates them |
| **Escalation notifications** | A `complaint_escalated` notification is persisted for the receiving authority (idempotent) |
| **Complaint timeline** | Frontend timeline component built from complaint + maintenance + escalation timestamps |
| **First-response tracking** | `firstResponseAt` recorded once, server-side, on the first meaningful maintenance action |
| **Resolution tracking** | `resolvedAt` set server-side; open escalations closed; student notified |
| **Dashboard KPIs** | Admin and Warden dashboards with aggregated metrics and Recharts visualisations |
| **MongoDB persistence** | All entities stored via Mongoose models |

### Roles

| Role | Responsibilities |
|------|-----------------|
| **Student** | Register/login, submit complaints, choose category and priority, view and track their own complaints, receive notifications |
| **Maintenance** | View assigned tasks, add progress notes, set estimated completion, update task status, complete work (which resolves the complaint) |
| **Admin** | Full visibility of all complaints, assign staff, update status/priority/notes, manage students and rooms, view system KPIs, receive new-complaint notifications |
| **Warden** | Manage complaints escalated to them (LOW / MEDIUM / HIGH priority), view escalation history, acknowledge and resolve escalations |

---

## SLA Matrix

SLA durations and escalation targets are defined once in
`backend/config/slaMatrix.js` and consumed through `backend/services/slaService.js`.
They are never hard-coded elsewhere.

| Priority | SLA | Escalates to |
|----------|-----|--------------|
| LOW | 48 hours | Warden |
| MEDIUM | 24 hours | Warden |
| HIGH | 6 hours | Warden |
| URGENT | 1 hour | Admin |

**SLA deadlines are calculated server-side when a complaint is created.** The
backend uses its own creation timestamp (`complaint.createdAt`) plus the matrix
duration for the complaint's priority — a client-supplied time is never used.

Legacy complaints that were created before SLA tracking existed have no
`slaDeadline`. The UI handles this correctly and displays:

> **SLA information unavailable**

No SLA outcome is ever fabricated for such complaints.

---

## Escalation Workflow

```
Student submits complaint
        │
        ▼
Maintenance handles the complaint (assignedTo)
        │
        ▼
SLA deadline is monitored
        │
        ▼
Scheduler detects a due escalation  (SLA deadline passed, complaint unresolved,
        │                            not already escalated)
        ▼
Complaint is escalated  (isEscalated = true, escalationLevel → 1,
        │                 currentAuthority + currentAuthorityRole set)
        ▼
Notification is generated  (persisted "complaint_escalated" for the authority)
        │
        ▼
Warden / Admin handles the escalation  (depends on priority)
        │
        ▼
Escalation is acknowledged, then resolved
        │
        ▼
Complaint resolution is tracked separately
```

### Authority mapping

| Priority | Escalation authority |
|----------|---------------------|
| LOW / MEDIUM / HIGH | **Warden** |
| URGENT | **Admin** |

The engine selects a concrete active user for the target role (oldest matching
account, deterministic across runs). If no active user exists for that role, the
complaint is left completely untouched.

### `assignedTo` vs. `currentAuthority`

These are two distinct references and escalation keeps them separate:

- **`assignedTo`** — the maintenance staff member responsible for doing the work.
  Escalation does **not** change this; the maintenance staff member keeps the
  complaint.
- **`currentAuthority` / `currentAuthorityRole`** — the escalation authority
  (Warden or Admin) added when the complaint is escalated. The Warden dashboard
  scopes every query to `currentAuthority === logged-in warden`.

### Idempotency & safety

- The escalation state change is a single atomic conditional update — concurrent
  scheduler runs produce exactly one winner, never a duplicate escalation.
- If the `Escalation` record fails to write, the claim is rolled back so a
  complaint never shows "escalated" without a matching escalation record.
- The escalation notification is an idempotent upsert keyed on
  `(recipient, type, complaint)`, so repeated scheduler ticks never create a
  duplicate.

---

## Complaint Lifecycle

Complaint status enum: `open`, `in_progress`, `resolved`, `closed`, `rejected`.

Intended path:

```
open → in_progress → resolved → closed
```

Transition rules are enforced **server-side** in
`backend/config/complaintLifecycle.js` (the frontend guard is not relied upon):

| From | Allowed next |
|------|-------------|
| `open` | `open`, `in_progress`, `resolved`, `rejected` |
| `in_progress` | `in_progress`, `open`, `resolved`, `rejected` |
| `resolved` | `resolved`, `closed` *(forward only)* |
| `closed` | `closed` *(terminal)* |
| `rejected` | `rejected`, `open`, `in_progress` |

- **Terminal states cannot be moved backward** through the normal status-update
  API. `resolved` / `closed` → `in_progress` or `open` is rejected with HTTP 400.
- **Assignment does not reopen a resolved complaint.** When an admin assigns
  staff, the complaint moves to `in_progress` only if that transition is allowed
  from its current state.

---

## Resolution & SLA Outcome

Both resolution paths — the admin status update
(`PUT /api/complaints/:id`) and maintenance task completion
(`PUT /api/maintenance/tasks/:id`) — go through a single service,
`backend/services/complaintResolutionService.js`:

- **`resolvedAt` is generated server-side** (the current server time).
- **A client-supplied `resolvedAt` is ignored** — the maintenance controller does
  not even read it from the request body.
- **`resolvedWithinSla` is calculated server-side** as
  `resolvedAt <= slaDeadline`.
- A complaint that has a real `slaDeadline` becomes, in the UI, one of
  **`RESOLVED_WITHIN_SLA`** or **`RESOLVED_AFTER_SLA`**.
- A legacy complaint with **no** `slaDeadline` keeps `resolvedWithinSla = null` —
  the outcome is genuinely unknown and is not fabricated.

On resolution the service also closes any still-open `Escalation` records for the
complaint and sends the student a `complaint_resolved` notification.

---

## First Response

`firstResponseAt` records the first meaningful maintenance response to a
complaint. It is set in `maintenanceController.updateTask` when the staff member
adds a progress note or moves the task to `in_progress` / `completed`.

- It is written **once**, server-side, only if not already set.
- It is **never** taken from the request body.
- Later responses do **not** overwrite it.

---

## Notifications

The notification system uses the existing `Notification` model
(`backend/models/Notification.js`) and a centralizing service
(`backend/services/notificationService.js`).

- **Escalation notifications are persisted** as `complaint_escalated`
  notifications for the receiving authority.
- **Notifications are idempotent** — the escalation notification is an atomic
  upsert keyed on `(userId, type, relatedId)`, so repeated scheduler runs or
  retries never create duplicates.
- **Frontend polling exists** — `components/Layout.jsx` calls
  `GET /api/notifications` on mount and then every 30 seconds, showing an unread
  count and a dropdown list.
- **The scheduler runs automatically** — `escalationScheduler` starts after the
  DB connects and the HTTP server is listening, ticking on an interval
  (default 60 s, `ESCALATION_INTERVAL_MS`), unless disabled with
  `ESCALATION_SCHEDULER=off`.

Notifications are also created for new complaint submissions
(`complaint_submitted` → admins), assignment (`complaint_assigned` → maintenance
staff), and resolution (`complaint_resolved` → student).

> This is **HTTP polling**, not WebSockets. There are no real-time sockets in the
> current implementation.

---

## Dashboard / KPIs

### Admin KPIs — `GET /api/complaints/stats`

Computed in a single MongoDB aggregation `$facet` pass, null-safe against legacy
documents:

| KPI | How it is calculated |
|-----|---------------------|
| **Total Complaints** | `countDocuments()` over all complaints |
| **Open Complaints** | count of `status = open` |
| **In Progress Complaints** | count of `status = in_progress` |
| **Resolved Complaints** | count of `status ∈ {resolved, closed}` |
| **Resolution Rate** | `resolved / total × 100` (1 decimal) |
| **SLA Compliance** | over resolved/closed complaints **that have an SLA deadline**: `withinSla / eligible × 100`, where "within SLA" means effective resolution time `<= slaDeadline` (`resolvedAt`, falling back to `updatedAt` for closed legacy complaints) |
| **Escalation Rate** | `escalatedComplaints / total × 100` where `isEscalated = true` |
| **Average Resolution Time** | average of `(resolvedAt − createdAt)` in hours over resolved/closed complaints where both timestamps are real dates; negative values (clock skew / bad legacy data) are excluded |
| **Active Escalations** | count of `isEscalated = true AND status ∉ {resolved, closed}` |

The endpoint also returns status/category/priority breakdowns and the 5 most
recent complaints.

### Warden KPIs — `GET /api/warden/escalations`

Always computed over the warden's **full** escalated workload (independent of the
active list filters): escalated complaints, pending / acknowledged / resolved
escalations, SLA breaches, urgent and high-priority counts, unresolved count, and
average hours since escalation.

---

## Technology Stack

### Backend
- **Node.js** + **Express 4** — HTTP server and routing
- **MongoDB** + **Mongoose 8** — persistence and modelling
- **jsonwebtoken** — JWT authentication
- **bcryptjs** — password hashing
- **express-validator** — request validation
- **cors**, **morgan**, **dotenv**
- **nodemon** (dev)

### Frontend
- **React 18** + **React DOM**
- **react-router-dom 6** — routing
- **axios** — API client
- **recharts** — dashboard charts
- **react-hot-toast** — toasts
- **@heroicons/react** — icons
- **Tailwind CSS** (via `react-scripts` / PostCSS) — styling
- **Create React App** (`react-scripts`) — build tooling

### Testing / verification
- **Jest** via `react-scripts test` (frontend unit tests, e.g. `slaState.test.js`)
- Plain Node verification scripts under `backend/scripts/`

Language: **JavaScript / JSX** throughout (no TypeScript).

---

## Architecture

```
┌─────────────────────────────┐
│          Frontend           │   React 18 SPA (Create React App)
│   React + React Router +    │   Role-scoped routes, axios API client,
│   Tailwind CSS + Recharts   │   30s notification polling
└──────────────┬──────────────┘
               │  HTTPS / REST (JSON), JWT bearer token
               ▼
┌─────────────────────────────┐
│      Backend (Express)      │   Monolithic Express app
│                             │
│  routes/       → controllers/                       │
│  middleware/   → protect + authorize (JWT, roles)   │
│  services/     → SLA, resolution, escalation,       │
│                  scheduler, notifications           │
│  config/       → SLA matrix, lifecycle policy       │
└──────────────┬──────────────┘
               │  Mongoose ODM
               ▼
┌─────────────────────────────┐
│           MongoDB           │   User, Student, Room, Complaint,
│                             │   Maintenance, Notification, Escalation
└─────────────────────────────┘
```

The backend keeps behaviour in focused services rather than in controllers:

| Service | Responsibility |
|---------|---------------|
| `slaService` | Validate priority; look up SLA config; calculate the SLA deadline. Side-effect-free. |
| `complaintResolutionService` | The single place that marks a **complaint** resolved (status, `resolvedAt`, `resolvedWithinSla`, close escalations, notify student). |
| `escalationService` | The single source of truth for escalation behaviour — eligibility predicate, atomic escalate, batch `processDueEscalations`, acknowledge/resolve an **escalation**, close escalations for a resolved complaint. |
| `escalationScheduler` | In-process interval timer that calls `processDueEscalations()`. Contains no escalation rules of its own; overlap-locked; a failed run never crashes the process. |
| `notificationService` | Centralized `Notification` creation, including the idempotent escalation notification upsert. |

This is a **monolithic** Express backend — not a microservices architecture.

---

## Database

MongoDB collections, defined as Mongoose models in `backend/models/`:

| Model | Purpose | Key fields / relationships |
|-------|---------|---------------------------|
| **User** | All accounts | `name`, `email` (unique), `password` (hashed, `select:false`), `role` (`student`/`maintenance`/`warden`/`admin`), `isActive` |
| **Student** | Student profile | `userId → User` (unique), `roomNumber`, `contact`, `guardianName/Contact`, `course`, `year` |
| **Room** | Hostel room | `roomNumber` (unique), `floor`, `capacity`, `occupied`, `type`, `status`, `amenities`, virtual `availableSlots` |
| **Complaint** | A grievance | `studentId → User`, `roomNumber`, `category`, `title`, `description`, `priority`, `status`, `assignedTo → User`, `adminNotes`, `resolvedAt`, `slaDeadline`, `escalationLevel`, `isEscalated`, `escalatedAt`, `escalationCount`, `firstResponseAt`, `resolvedWithinSla`, `currentAuthority → User`, `currentAuthorityRole`, `rating`, `feedback`, timestamps |
| **Maintenance** | Work record for a complaint | `complaintId → Complaint`, `staffId → User`, `assignedBy → User`, `status` (`assigned`/`in_progress`/`completed`/`cancelled`), `notes[]` (text/addedAt/addedBy), `estimatedCompletion`, `completedAt`, `materials[]`, `laborCost` |
| **Notification** | User notification | `userId → User`, `title`, `message`, `type`, `relatedId`, `isRead` |
| **Escalation** | One escalation event | `complaintId → Complaint`, `fromLevel`/`toLevel`, `fromRole`/`toRole`, `reason`, `escalatedAt`, `acknowledgedAt`, `resolvedAt` |

Relationships (references, not joins):

```
User ──1:1── Student
User ──1:N── Complaint          (as studentId)
User ──1:N── Complaint          (as assignedTo — maintenance staff)
User ──1:N── Complaint          (as currentAuthority — escalation authority)
Complaint ──1:1── Maintenance
Complaint ──1:N── Escalation    (escalation history)
User ──1:N── Notification
```

`Room` and `Student` are linked by `roomNumber` (a string), not by ObjectId.

---

## API Overview

All routes are prefixed with `/api`. Every group except `auth` register/login and
`/api/health` requires a valid JWT (`Authorization: Bearer <token>`).

| Prefix | Auth | Representative endpoints |
|--------|------|------------------------|
| `/api/auth` | public / bearer | `POST /register`, `POST /login`, `GET /me`, `PUT /update-password` |
| `/api/complaints` | bearer (role-scoped) | `GET /` (role-filtered list, pagination + filters), `POST /` (student), `GET /:id`, `PUT /:id` (admin/maintenance), `DELETE /:id` (admin or owning student), `GET /stats` (admin) |
| `/api/maintenance` | maintenance / admin | `GET /tasks`, `PUT /tasks/:id` |
| `/api/warden` | warden | `GET /escalations` (+ KPIs), `GET /escalations/:complaintId`, `PATCH /escalations/:escalationId/acknowledge`, `PATCH /escalations/:escalationId/resolve` |
| `/api/notifications` | bearer | `GET /`, `PUT /:id/read` (`:id` may be `all`) |
| `/api/students` | admin | `GET /`, `GET /maintenance-staff`, `GET /:id`, `PUT /:id` |
| `/api/rooms` | bearer / admin | `GET /`, `GET /:id`, `POST /` (admin), `PUT /:id` (admin), `DELETE /:id` (admin) |
| `/api/health` | public | `GET /` → `{ status: "OK", ... }` |

---

## Project Structure

```
ResolveX/
├── backend/
│   ├── config/
│   │   ├── slaMatrix.js            # SLA durations + escalation targets (single source of truth)
│   │   ├── complaintLifecycle.js   # allowed status transitions
│   │   └── seed.js                 # destructive demo seeder (NOT run automatically)
│   ├── controllers/                # auth, complaint, maintenance, warden, notification, room, student
│   ├── middleware/
│   │   └── auth.js                 # protect (JWT) + authorize (roles)
│   ├── models/                     # User, Student, Room, Complaint, Maintenance, Notification, Escalation
│   ├── routes/                     # one router per resource group
│   ├── services/
│   │   ├── slaService.js
│   │   ├── complaintResolutionService.js
│   │   ├── escalationService.js
│   │   ├── escalationScheduler.js
│   │   └── notificationService.js
│   ├── scripts/                    # verification scripts + safe helpers (createWardenDemo, backfillSlaDeadlines)
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── public/                     # index.html, logo.png
│   ├── src/
│   │   ├── components/             # Layout, Logo, UI, ComplaintTimeline, SLAStatus, slaState(.js/.test.js)
│   │   ├── context/               # AuthContext
│   │   ├── pages/                 # student/ admin/ maintenance/ warden/ shared/ + Login/Register
│   │   ├── utils/api.js           # axios instance + endpoint wrappers
│   │   ├── App.js
│   │   └── index.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── package.json
│   └── .env.example
├── logo.png
├── LICENSE
├── README.md
└── .gitignore
```

---

## Installation & Setup

### Prerequisites

- **Node.js** 18+ and npm
- **MongoDB** — a local `mongod` instance or a MongoDB Atlas connection string
- Windows, macOS, or Linux (commands below are Windows-friendly)

### 1. Clone

```powershell
git clone https://github.com/JalajaUtekar/Hostel-Grievance-Portal-with-SLA-and-Escalation.git ResolveX
cd ResolveX
```

### 2. Backend dependencies

```powershell
cd backend
npm install
```

### 3. Create the backend environment file

The backend requires a local `backend/.env` file. It is **not** committed (it is
excluded by `.gitignore`). Copy the example and fill in your own values:

```powershell
copy .env.example .env
```

`backend/.env` (use your **own** placeholders — do not commit real values):

```
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

MONGO_URI=<your_mongodb_connection_string>
JWT_SECRET=<your_random_secret>
JWT_EXPIRE=7d

# Escalation scheduler (optional)
ESCALATION_INTERVAL_MS=60000
# ESCALATION_SCHEDULER=off
```

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | long random string used to sign tokens |
| `PORT` | no | defaults to `5000` |
| `NODE_ENV` | no | `development` enables `morgan` request logging |
| `CLIENT_URL` | no | CORS origin; defaults to `http://localhost:3000` |
| `JWT_EXPIRE` | no | token lifetime; defaults to `7d` |
| `ESCALATION_INTERVAL_MS` | no | scheduler tick interval; defaults to `60000` |
| `ESCALATION_SCHEDULER` | no | set to `off` to disable the automatic scheduler |

### 4. Frontend dependencies

```powershell
cd ../frontend
npm install
```

The frontend needs no environment file for local development — it proxies API
requests to `http://localhost:5000` (see `"proxy"` in `frontend/package.json`).
An optional `frontend/.env` may set `REACT_APP_API_URL`.

---

## Running the Application

Run the backend and frontend in two terminals.

### Backend (development server, auto-reload)

```powershell
cd backend
npm run dev
```

Other backend scripts (`backend/package.json`):

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `nodemon server.js` | development server with reload |
| `npm start` | `node server.js` | plain start |
| `npm run verify:sla` | `node scripts/verifySlaService.js` | SLA service verification |

The API starts on **http://localhost:5000** and exposes a health check at
**http://localhost:5000/api/health**.

### Frontend (development server)

```powershell
cd frontend
npm start
```

The React app runs on **http://localhost:3000** and proxies `/api/*` to the
backend.

### Frontend production build

```powershell
cd frontend
npm run build
```

---

## Demo Accounts

> These are **LOCAL DEMO credentials** for a college project. They are only
> useful against your own local database and carry no privileges anywhere else.

The intentional demo Warden account (created by the safe, non-destructive helper
`backend/scripts/createWardenDemo.js`):

| Field | Value |
|-------|-------|
| Email | `warden@hostel.com` |
| Password | `warden123` |
| Role | `warden` |

Create it with:

```powershell
cd backend
node scripts/createWardenDemo.js
```

This helper creates a single warden account if it does not already exist and
never modifies or deletes existing data.

Other demo accounts (student / maintenance / admin) can be created through the
registration form, or exist only inside `backend/config/seed.js`. **`seed.js` is
destructive — it wipes collections — and is intentionally not run as part of
setup.** Never treat the MongoDB connection string or JWT secret as a demo
credential; they are infrastructure secrets and are not published here.

---

## Testing & Verification

The repository includes a frontend unit test and a set of standalone backend
verification scripts (run with `node` against a MongoDB instance). Results from
the completed hardening pass:

| Suite | Result |
|-------|--------|
| `backend/scripts/verifyHardening.js` | 30 / 30 |
| `backend/scripts/verifyEscalationService.js` | 61 / 61 |
| `backend/scripts/verifySchedulerNotifications.js` | 51 / 51 |
| `backend/scripts/verifyWardenDashboard.js` | 52 / 52 |
| `backend/scripts/verifySlaTimelineUi.js` | 29 / 29 |
| `backend/scripts/verifyMaintenanceResolution.js` | 32 / 32 |
| `backend/scripts/verifySlaService.js` | passing |
| `frontend/src/components/slaState.test.js` (Jest) | 13 / 13 |
| Frontend production build (`npm run build`) | successful |
| Role login checks (student / maintenance / admin / warden) | all four successful |
| `GET /api/health` | 200 OK |

These are development verification suites for a college project, not a formal
production-certification process.

---

## Security / Data Integrity

Implemented protections:

- **JWT authentication** — `protect` middleware verifies the bearer token, loads
  the user, and rejects inactive accounts.
- **Role authorization** — `authorize(...roles)` gates every protected route;
  React routes are also role-scoped.
- **Warden ownership scoping** — a warden can only see or act on complaints whose
  `currentAuthority` is their own user id; ownership is derived from `req.user`,
  never from the request body or query.
- **Server-side SLA calculation** — deadlines come from the server clock and the
  centralized matrix, never from client input.
- **Server-side resolution timestamps** — `resolvedAt` and `resolvedWithinSla`
  are set by the resolution service; client-supplied values are ignored.
- **Server-side first-response timestamp** — `firstResponseAt` is written once,
  server-side, and never overwritten.
- **Lifecycle transition validation** — status changes are validated against an
  explicit transition table; terminal states cannot move backward.
- **ReDoS-safe email validation** — the `User.email` regex is linear-time (no
  nested quantifiers); `express-validator`'s `isEmail()` is the primary check.
- **Password hashing** — bcrypt with a cost factor of 12; passwords are
  `select:false` and stripped from JSON output.
- **Secrets excluded from version control** — `.env` and `.env.*` (except
  `.env.example`) are listed in `.gitignore`.

---

## Current Scope

**Implemented now:**

- Four-role authentication and authorization
- Student complaint submission and tracking
- Maintenance task assignment and completion
- Admin complaint management, student and room management
- Centralized SLA matrix and server-side SLA deadline calculation
- SLA state UI (within / breached / resolved-within / resolved-after / unavailable)
- Escalation engine with atomic, idempotent escalation
- In-process escalation scheduler
- Persisted, idempotent escalation notifications + 30s frontend polling
- Warden escalation dashboard with acknowledge / resolve
- Admin and Warden KPI dashboards with Recharts
- Complaint timeline and first-response / resolution tracking
- Backend verification scripts + a frontend unit test

**Not implemented (see below):** priority queue / min-heap scheduling, TCP
communication, and a formal ER diagram.

### Planned Enhancements

These are future development / review steps and are **not** part of the current
codebase:

- A binary-heap **priority queue** so higher-priority escalation events are
  processed before lower-priority ones
- **TCP-level** communication experiments
- A formal **ER diagram** of the data model

---

## UI / Branding

- **ResolveX** — product name; wordmark renders the trailing **X** in the accent
  red (`components/Logo.jsx`).
- **MMCOE Hostel Grievance Portal** — subtitle.
- **`logo.png`** — the shared brand mark, served from `frontend/public/logo.png`
  and also kept at the repository root.
- **Visual identity** — a light, warm-neutral surface with white cards, charcoal
  ink text, a deep burgundy primary shading to bright red, and a deliberately
  vivid red reserved for escalation / SLA-breach states. Brand tokens live in
  `frontend/tailwind.config.js`. Fonts: DM Sans (body), Sora (display),
  JetBrains Mono (mono).
- **Responsive, role-specific dashboards** — each role gets its own route tree
  and navigation via a shared `Layout` component.

---

## License

Released under the **MIT License** — Copyright (c) 2026 ResolveX — MMCOE Hostel
Grievance Portal. See [`LICENSE`](LICENSE) for the full text.
#   e d i _ p r o j e c t  
 
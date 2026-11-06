# CampusIQ

CampusIQ is a React dashboard with an Express API for campus rooms, classroom bookings, schedules, notices and account management. It preserves the existing dashboard and supports a clearly separated local demo mode or PostgreSQL-backed records.

## Requirements

- Node.js 20.19 or later (the start scripts use Node's `--env-file-if-exists` option).
- PostgreSQL 14 or later for database mode.
- Permission to create the PostgreSQL `btree_gist` extension for the overlap exclusion constraints.

## Install and configure

```bash
npm install
copy .env.example .env
```

Edit `.env` before starting. Set `JWT_SECRET` to a random secret with at least 32 characters. For PostgreSQL mode, set `DATABASE_URL`, for example:

```env
DATABASE_URL=postgresql://campusiq_user:your_password@localhost:5432/campusiq?schema=public
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
PORT=4000
FRONTEND_URL=http://localhost:5173
DEMO_PASSWORD=change-this-demo-password
```

If `DATABASE_URL` is blank, the app runs in JSON demo mode. It does not connect to PostgreSQL. Demo bookings and registered demo accounts live in `server/data`; they are not merged into PostgreSQL records.

## PostgreSQL setup

Create an empty PostgreSQL database and set its connection URL in `.env`. Then run:

```bash
npm run db:generate
npm run db:migrate
```

The initial Prisma migration creates the tables, indexes, foreign keys, positive-capacity/time checks, and GiST exclusion constraints that prevent overlapping active bookings and room schedule entries. PostgreSQL must permit `CREATE EXTENSION btree_gist`.

To load the existing Phase 1 room and schedule examples as **DEMO** records, set `DEMO_PASSWORD` and run:

```bash
npm run db:seed
```

Seeded logins all use the configured `DEMO_PASSWORD`:

| Role | Email |
| --- | --- |
| Student | `student@campusiq.demo` |
| Faculty | `faculty@campusiq.demo` |
| Admin | `admin@campusiq.demo` |

Seeded data is marked `isDemo=true`; each demo login sees demo records, while normal accounts see only real records. Room capacities remain null unless present in the source data. Do not use demo credentials for a public deployment.

Create a real first administrator or faculty account interactively with `npm run db:create-user`. Administrators can add further accounts using the protected `POST /api/admin/users` endpoint. Student self-registration is available at `POST /api/auth/register`.

## Start CampusIQ

Development (Vite on port 5173 and Express on port 4000):

```bash
npm run dev:all
```

Production build and server:

```bash
npm run build
npm start
```

The Express server serves the built frontend and API on port 4000. Health is available at `/api/health`. Swagger UI and the OpenAPI JSON are at `/api-docs` and `/api-docs.json`.

## Backend coverage

- JWT login, student registration, profile and password updates, bcrypt hashing, and role-based authorization.
- Building, floor, classroom, capacity and live availability search. Unconfirmed capacities stay null.
- Faculty classroom requests, overlap checks, alternative room suggestions, admin approval/rejection, cancellation, rescheduling and audit history.
- Academic schedules with branch/year/semester/section targeting and student read-only access.
- Examination notices, announcements, targeting, notifications, and change history.
- Admin room/building catalog persistence, user provisioning, notifications and audit logs.
- Serializable booking/schedule write transactions and PostgreSQL GiST exclusion constraints for active time conflicts.

## API and demo boundaries

All authenticated API calls use `Authorization: Bearer <token>`. Database mode requires `JWT_SECRET`; demo mode uses a process-local secret, so demo sessions expire after a server restart. Demo registrations in JSON mode are stored separately from the seeded built-in demo accounts.

The pre-existing admin catalog editor remains available. In PostgreSQL mode its saves write to Prisma models; in JSON demo mode its saves remain in the local catalog store. Some optional profile preferences remain browser-only.

## Limitations

This workspace did not have a PostgreSQL server available, so the migration could not be applied and PostgreSQL integration/concurrency behavior was not exercised here. The project must install the matching Prisma ORM CLI/client and PostgreSQL adapter packages, run `npm run db:generate`, then migrate against a configured database. No official room capacities or institutional facts have been fabricated.

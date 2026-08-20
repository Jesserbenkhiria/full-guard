# Guard Planning

Security staff planning management platform — an intermediate assistant to prepare, validate, and export monthly agent schedules before sending them to SEKUR.

## Tech Stack

- **Frontend:** Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Server Actions / API Routes, Prisma ORM, MongoDB, Zod
- **Infrastructure:** Docker, environment-based configuration

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (optional, for MongoDB)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Start MongoDB

```bash
docker compose up mongodb -d
```

### 4. Push schema & seed data

```bash
npm run db:push
npm run db:seed
```

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login placeholder
│   ├── (dashboard)/     # Main app pages
│   ├── planning/print/  # PDF export (print view)
│   └── api/             # API routes
├── components/
│   ├── layout/          # Sidebar, header, shell
│   └── ui/              # shadcn components
├── lib/
│   ├── auth/            # Session placeholder
│   ├── validations/     # Zod schemas
│   └── db.ts            # Prisma client
├── services/
│   ├── dashboard/       # Stats queries
│   ├── import/          # CSV/Excel parsers
│   ├── planning/        # Auto-fill engine
│   └── rules/           # Rules engine
└── types/               # Shared TypeScript types
```

## Development Phases

| Phase | Module | Status |
|-------|--------|--------|
| 1 | Project setup, auth placeholder, database | ✅ Done |
| 2 | Agents & Sites CRUD | ✅ Done |
| 3 | Planning calendar (site/agent views, assignments) | ✅ Done |
| 4 | Assignment system (CRUD, drag-and-drop move) | ✅ Done |
| 5 | Rules engine (validation, alerts) | ✅ Done |
| 6 | Auto-fill suggestions (preview + bulk apply) | ✅ Done |
| 7 | PDF export (print-optimized page) | ✅ Done |
| 8 | Import system (CSV/Excel) | 🔜 Next |

## Docker (full stack)

```bash
docker compose up --build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push Prisma schema to MongoDB |
| `npm run db:seed` | Seed sample agents & sites |
| `npm run db:studio` | Open Prisma Studio |

## License

Private — internal use only.

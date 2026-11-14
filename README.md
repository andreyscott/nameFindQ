# NameFindQ

**NameFindQ** is a semantic name-search app. Instead of matching exact spelling, it uses Qwen embeddings (Alibaba Cloud DashScope) stored in Supabase (`pgvector`) to find names with similar meaning and origin. It has a responsive Next.js, Tailwind CSS and Framer Motion interface. It ships as a standalone Docker container for deployment on Alibaba Cloud Function Compute.

## Features

- **Semantic Name Search**: Uses Qwen embeddings to understand the meaning and origin of names and return accurate semantic matches.
- **Supabase Integration**: Supabase provides authentication and PostgreSQL storage, with `pgvector` for similarity search over embeddings.
- **Modern UI**: Built with React, Next.js, Tailwind CSS and Framer Motion.
- **Cloud-Native Deployment**: Containerized and optimized for Alibaba Cloud Function Compute (FC 3.0).

## Prerequisites

- Node.js v20.9+ (Next.js 16 requirement) and npm
- A [Supabase](https://supabase.com) project (PostgreSQL with the `pgvector` extension enabled)
- A Qwen / Alibaba Cloud DashScope API key
- Docker (only for container builds)

## Setup

1. **Clone the repository and install dependencies**

   ```bash
   git clone https://github.com/andreyscott/nameFindQ.git
   cd nameFindQ
   npm install
   ```

2. **Enable `pgvector` in Supabase**

   In the Supabase SQL editor, run:

   ```sql
   create extension if not exists vector;
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env.local` and fill in the values. It documents every variable, including `NEXT_PUBLIC_SITE_URL` (used for OAuth redirects) and optional quota settings.

   > Never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` is a server-side secret.

4. **Initialize the database**

   Run `supabase/schema.sql`, then each file in `supabase/migrations/` in name order, in the Supabase SQL editor. The migrations add `names.source` (which protects the curated seed names from AI overwrites) and the `api_usage` quota table. Then:

   ```bash
   npm run db:seed        # seed the names data
   npm run db:deploy-fn   # deploy the vector matching function to Supabase
   npm run db:embed       # generate and store embeddings for the names
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | Run ESLint |
| `npm test` | Run all Vitest tests |
| `npm run test:unit` / `npm run test:logic` | Run specific test suites |
| `npm run docker:build` | Build and push the Docker image |

## Deployment

The app deploys to **Vercel** (live) and to **Alibaba Cloud Function Compute 3.0** via Docker. Before deploying a new version, apply any new files in `supabase/migrations/`.

### Vercel

Set the variables from `.env.example` in the project settings. `NEXT_PUBLIC_SITE_URL` is optional on Vercel (it falls back to the production URL).

### Docker / Alibaba FC 3.0

```bash
npm run docker:build
```

The image (Node 22, standalone Next.js server) needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SITE_URL` at **build** time. Set the server secrets at runtime in FC. Set `TRUSTED_IP_HEADER` to the header your FC gateway uses for the client IP, so the free-tier limits are counted per visitor.

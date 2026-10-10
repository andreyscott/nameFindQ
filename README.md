# NameFindQ

**NameFindQ** is a semantic name-search app. Instead of matching exact spelling, it uses Qwen embeddings (Alibaba Cloud DashScope) stored in Supabase (`pgvector`) to find names with similar meaning and origin. It has a responsive Next.js, Tailwind CSS and Framer Motion interface. It ships as a standalone Docker container for deployment on Alibaba Cloud Function Compute.

## Features

- **Semantic Name Search**: Uses Qwen embeddings to understand the meaning and origin of names and return accurate semantic matches.
- **Supabase Integration**: Supabase provides authentication and PostgreSQL storage, with `pgvector` for similarity search over embeddings.
- **Modern UI**: Built with React, Next.js, Tailwind CSS and Framer Motion.
- **Cloud-Native Deployment**: Containerized and optimized for Alibaba Cloud Function Compute (FC 3.0).

## Prerequisites

- Node.js v18+ and npm (or yarn/pnpm)
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

   Create a `.env.local` file in the project root:

   ```env
   # Supabase (Project Settings -> API)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # Direct Postgres connection string (Project Settings -> Database)
   DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres

   # Qwen / DashScope
   QWEN_API_KEY=your-dashscope-api-key
   QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
   ```

   > Never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` is a server-side secret.

4. **Initialize the database**

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

## Docker & Deployment

To build the production Docker image (targeted at Alibaba Cloud FC 3.0):

```bash
npm run docker:build
```

The app is bundled as a standalone Next.js server that runs as a serverless container. Provide the same environment variables as above in your deployment configuration.

# Supabase Setup

This guide covers S1: creating the Supabase project and applying the Averion.ai MVP schema.

Supabase is used as the PostgreSQL database for structured product data:

- organizations
- users
- documents
- document_chunks
- conversations
- messages
- feedback

Chroma is still used for vector search during the MVP. Supabase stores metadata and text chunks; Chroma stores embeddings.

## What Connects To What

```text
Frontend upload UI
  -> FastAPI backend
  -> Supabase Postgres for metadata and chunks
  -> Chroma for vector embeddings
```

The frontend should not receive the database password. Only the FastAPI backend uses `DATABASE_URL`.

## Step 1: Create A Supabase Project

1. Open [Supabase](https://supabase.com).
2. Sign in or create an account.
3. Click `New project`.
4. Choose your organization.
5. Use a clear project name:

```text
averion-ai
```

6. Choose a database password and store it safely.
7. Choose the closest region.
8. Create the project.

Do not commit the database password or connection string to GitHub.

## Step 2: Get The Database Connection String

1. Open the Supabase project dashboard.
2. Click `Connect`.
3. Copy a Postgres connection string.

For local FastAPI development, prefer:

- Direct connection if your network supports IPv6.
- Session pooler if direct connection fails because of IPv6/network issues.

Save it locally in:

```text
apps/api/.env
```

Example:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[HOST]:5432/postgres
```

If you use a pooler URL, paste that instead. Keep it in `.env` only.

## Step 3: Apply The Schema

1. Open the Supabase project dashboard.
2. Go to `SQL Editor`.
3. Open [schema.sql](schema.sql) from this repo.
4. Copy the full SQL.
5. Paste it into the Supabase SQL Editor.
6. Run it.

Expected tables:

```text
organizations
users
documents
document_chunks
conversations
messages
feedback
```

## Step 4: Verify The Tables

Open [supabase_verify.sql](supabase_verify.sql), copy the SQL, and run it in Supabase SQL Editor.

Expected result:

- 7 rows
- every `exists` value is `true`

You can also check in the Supabase Table Editor that all seven tables are visible.

## Step 5: Create Local Env File

From the repo root:

```bash
cp apps/api/.env.example apps/api/.env
```

Then edit:

```text
apps/api/.env
```

Set:

```env
DATABASE_URL=your_supabase_postgres_connection_string
```

Never commit `apps/api/.env`.

## Safety Checklist

Before closing S1:

- Supabase project exists.
- `docs/schema.sql` has been applied.
- `docs/supabase_verify.sql` shows all required tables.
- `apps/api/.env` contains `DATABASE_URL` locally.
- `git status` does not show `apps/api/.env`.
- No passwords or Supabase secrets are in committed files.

## Troubleshooting

If the direct connection does not work, use the Supabase pooler connection string from the `Connect` page.

If schema creation fails because tables already exist, the schema was probably already applied. Run [supabase_verify.sql](supabase_verify.sql) to confirm.

If you accidentally paste a secret into a tracked file, do not commit it. Remove it immediately and ask for help before pushing.

# Plan 02: Server Quota DB & Service

> Source PRD: `docs/milestones/quota-and-effort/prd-quota-and-effort.md`

## Context

Create the database table that tracks research usage per user and the service layer that encapsulates all quota logic: pre-flight checks, credit reservation, post-completion updates, and the status query used by the settings page. The research controller (plan 03) and usage endpoint (plan 04) import from this service.

---

## What to build

### 1. Migration — `apps/server/database/migrations/1780000000000_create_research_usage_table.ts`

The timestamp must be later than the existing token migration (`1768620764696`). Use `1780000000000` or `node ace make:migration research_usage` which auto-generates a fresh timestamp.

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'research_usage'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Set at request start
      table.string('effort', 10).notNullable().defaultTo('high')
      table.integer('estimated_credits').notNullable().defaultTo(0)

      // Updated from agent done event (null while in-flight or if run failed)
      table.integer('actual_credits').nullable()
      table.integer('searches_done').nullable()
      table.integer('links_evaluated').nullable()

      // pending → completed | failed
      table.string('status', 20).notNullable().defaultTo('pending')

      table.string('thread_id', 100).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    // Fast quota window queries: sum credits within time range per user
    this.schema.raw(`
      CREATE INDEX research_usage_user_created_idx
        ON research_usage (user_id, created_at)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

### 2. Env vars — `apps/server/start/env.ts`

Add optional quota limits (the service provides sensible defaults so existing `.env` files don't break):

```typescript
DAILY_QUOTA_CREDITS: Env.schema.number.optional(),
HOURLY_QUOTA_CREDITS: Env.schema.number.optional(),
```

### 3. Service — `apps/server/app/modules/research/services/quota_service.ts`

```typescript
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { DateTime } from 'luxon'

const DAILY_LIMIT  = () => env.get('DAILY_QUOTA_CREDITS',  200)
const HOURLY_LIMIT = () => env.get('HOURLY_QUOTA_CREDITS',  50)

/**
 * Sum credits consumed within a time window for a user.
 *
 * Uses estimated_credits for pending rows (in-flight),
 * actual_credits for completed rows.
 * Failed rows are excluded — a failed run does not consume quota.
 */
async function sumCredits(userId: number, since: DateTime): Promise<number> {
  const row = await db
    .from('research_usage')
    .where('user_id', userId)
    .where('created_at', '>=', since.toSQL()!)
    .select(
      db.raw(`
        SUM(
          CASE
            WHEN status = 'pending'   THEN estimated_credits
            WHEN status = 'completed' THEN COALESCE(actual_credits, 0)
            ELSE 0
          END
        ) AS total
      `)
    )
    .first()
  return Number(row?.total ?? 0)
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean
  exceeded?: 'daily' | 'hourly'
  used?: number
  limit?: number
  resets_at?: string
}

/**
 * Check whether a user has enough remaining quota to run a research of
 * the given estimated cost. Returns `allowed: true` or a rejection object
 * with enough detail for the 429 response body.
 */
export async function checkQuota(
  userId: number,
  estimatedCost: number
): Promise<QuotaCheckResult> {
  const now = DateTime.utc()

  const [daily, hourly] = await Promise.all([
    sumCredits(userId, now.startOf('day')),
    sumCredits(userId, now.startOf('hour')),
  ])

  if (daily + estimatedCost > DAILY_LIMIT()) {
    return {
      allowed: false,
      exceeded: 'daily',
      used: daily,
      limit: DAILY_LIMIT(),
      resets_at: now.startOf('day').plus({ days: 1 }).toISO()!,
    }
  }

  if (hourly + estimatedCost > HOURLY_LIMIT()) {
    return {
      allowed: false,
      exceeded: 'hourly',
      used: hourly,
      limit: HOURLY_LIMIT(),
      resets_at: now.startOf('hour').plus({ hours: 1 }).toISO()!,
    }
  }

  return { allowed: true }
}

/**
 * Insert a pending usage record, returning its id.
 * Call immediately after checkQuota passes, before forwarding to the agent.
 */
export async function reserveCredits(
  userId: number,
  effort: string,
  estimatedCredits: number,
  threadId: string
): Promise<number> {
  const [row] = await db
    .table('research_usage')
    .insert({
      user_id: userId,
      effort,
      estimated_credits: estimatedCredits,
      status: 'pending',
      thread_id: threadId,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('id')
  return row.id
}

/**
 * Update the usage record with actual values from the agent done event.
 * Fire-and-forget safe — the caller should not await if inside a stream.
 */
export async function updateUsage(
  usageId: number,
  actualCredits: number,
  searchesDone: number,
  linksEvaluated: number
): Promise<void> {
  await db.from('research_usage').where('id', usageId).update({
    status: 'completed',
    actual_credits: actualCredits,
    searches_done: searchesDone,
    links_evaluated: linksEvaluated,
    updated_at: new Date(),
  })
}

/**
 * Mark a usage record as failed (e.g. agent unreachable, SSE error event).
 * Failed rows are excluded from quota sums so the user is not penalised.
 */
export async function markFailed(usageId: number): Promise<void> {
  await db.from('research_usage').where('id', usageId).update({
    status: 'failed',
    updated_at: new Date(),
  })
}

export interface QuotaStatus {
  daily:  { used: number; limit: number; resets_at: string }
  hourly: { used: number; limit: number; resets_at: string }
  today:  { researches: number; searches: number; links: number }
}

/**
 * Full quota status for the settings page.
 */
export async function getQuotaStatus(userId: number): Promise<QuotaStatus> {
  const now = DateTime.utc()
  const dayStart = now.startOf('day')

  const [daily, hourly, today] = await Promise.all([
    sumCredits(userId, dayStart),
    sumCredits(userId, now.startOf('hour')),
    db
      .from('research_usage')
      .where('user_id', userId)
      .where('created_at', '>=', dayStart.toSQL()!)
      .select(
        db.raw('COUNT(*) AS researches'),
        db.raw('SUM(COALESCE(searches_done,    0)) AS searches'),
        db.raw('SUM(COALESCE(links_evaluated,  0)) AS links')
      )
      .first(),
  ])

  return {
    daily: {
      used: daily,
      limit: DAILY_LIMIT(),
      resets_at: dayStart.plus({ days: 1 }).toISO()!,
    },
    hourly: {
      used: hourly,
      limit: HOURLY_LIMIT(),
      resets_at: now.startOf('hour').plus({ hours: 1 }).toISO()!,
    },
    today: {
      researches: Number(today?.researches ?? 0),
      searches:   Number(today?.searches   ?? 0),
      links:      Number(today?.links      ?? 0),
    },
  }
}
```

---

## Verification

```bash
# Run migration
cd apps/server && node ace migration:run
# Expect: "research_usage" table created, index present

# Seed a row and verify quota check
# (node ace repl or a throwaway script)
await reserveCredits(1, 'medium', 20, 'test-thread')
# → row in DB with status='pending', estimated_credits=20

const check = await checkQuota(1, 20)
# → { allowed: true }  (20 used, 200 limit)

await updateUsage(1, 15, 3, 15)
# → row updated: status='completed', actual_credits=15

# Test daily limit
# Insert rows totalling 190 credits, then checkQuota(userId, 20)
# → { allowed: false, exceeded: 'daily', used: 190, limit: 200, resets_at: '...' }
```

---

## Files created/modified

| File | Action |
|---|---|
| `apps/server/database/migrations/1780000000000_create_research_usage_table.ts` | Created |
| `apps/server/start/env.ts` | Add `DAILY_QUOTA_CREDITS`, `HOURLY_QUOTA_CREDITS` optional |
| `apps/server/app/modules/research/services/quota_service.ts` | Created |

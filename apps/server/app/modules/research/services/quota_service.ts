import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { DateTime } from 'luxon'

const DAILY_LIMIT = () => env.get('DAILY_QUOTA_CREDITS', 200)
const HOURLY_LIMIT = () => env.get('HOURLY_QUOTA_CREDITS', 50)

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
  daily: { used: number; limit: number; resets_at: string }
  hourly: { used: number; limit: number; resets_at: string }
  today: { researches: number; searches: number; links: number }
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
      searches: Number(today?.searches ?? 0),
      links: Number(today?.links ?? 0),
    },
  }
}

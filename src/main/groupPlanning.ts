import { groupText } from '../shared/groupText'
import type { InterfaceLanguage } from '../shared/language'
import { DecisionTransportError } from './decisionStream'

export const GROUP_PLANNING_ATTEMPT_MS = 60_000
export const GROUP_PLANNING_BUDGET_MS = 180_000
class PlanningTimeoutError extends Error {}

/** Use bounded categories in chat; provider details stay in diagnostic events. */
export function planningFailureReason(error: unknown, language: InterfaceLanguage): string {
  const detail = error instanceof Error ? error.message : ''
  const key = error instanceof PlanningTimeoutError || /timeout|timed out|within \d+ seconds|秒内|超时/i.test(detail) ? 'Planning response timed out'
    : /no .*?(content|response)|without a text response|empty|没有返回|未返回/i.test(detail) ? 'The model returned an empty planning response'
    : /json|invalid|schema|格式|无效/i.test(detail) ? 'The model returned an invalid plan format'
    : /401|403|auth|credentials/i.test(detail) ? 'The planning model could not authenticate'
    : /429|rate limit/i.test(detail) ? 'The planning service is rate limited'
    : 'The planning request failed'
  return groupText(language, key)
}

/** Ask candidates in order. An attempt is cancelled before the next starts;
 * late responses never become a second plan or dispatch duplicate work. */
export async function firstGroupPlan<T>(
  candidates: { backendKey?: string; run: (signal: AbortSignal, onProgress: () => void) => Promise<T> }[],
  signal: AbortSignal,
  budgetMs = GROUP_PLANNING_BUDGET_MS,
  attemptMs = GROUP_PLANNING_ATTEMPT_MS,
  language: InterfaceLanguage = 'en'
): Promise<T> {
  signal.throwIfAborted()
  if (!candidates.length) throw new Error(groupText(language, 'No group coordinator is available.'))
  const deadline = Date.now() + budgetMs
  const budgetError = () => new PlanningTimeoutError(groupText(language, 'Group planning exceeded {seconds} seconds and was paused. Retry later or change the decision model.', { seconds: Math.round(budgetMs / 1000) }))
  let lastError: unknown
  let attempted = 0
  const failedBackends = new Set<string>()
  for (const candidate of candidates) {
    signal.throwIfAborted()
    if (candidate.backendKey && failedBackends.has(candidate.backendKey)) continue
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw budgetError()
    const abort = new AbortController()
    const combined = AbortSignal.any([signal, abort.signal])
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const arm = () => {
      if (settled || combined.aborted) return
      clearTimeout(timer)
      timer = setTimeout(() => abort.abort(Date.now() >= deadline ? budgetError()
        : new PlanningTimeoutError(groupText(language, 'This coordinator produced no planning output for {seconds} seconds.', { seconds: Math.round(attemptMs / 1000) }))),
      Math.max(1, Math.min(attemptMs, deadline - Date.now())))
    }
    arm()
    attempted++
    try {
      const plan = await cancellableGroupPlan(() => candidate.run(combined, arm), combined)
      combined.throwIfAborted()
      return plan
    } catch (error) {
      signal.throwIfAborted()
      lastError = error
      // Retrying the same backend under another persona is not failover.
      // A malformed plan can be persona-specific, so only transport/timeouts
      // suppress duplicate backend attempts during this decision.
      if (candidate.backendKey && (error instanceof PlanningTimeoutError || error instanceof DecisionTransportError)) {
        failedBackends.add(candidate.backendKey)
      }
    } finally {
      settled = true
      clearTimeout(timer)
      abort.abort(new Error('Planning attempt finished'))
    }
  }
  if (Date.now() >= deadline) throw budgetError()
  // Preserve transport status for the configured service's circuit breaker.
  if (candidates.length === 1 && lastError) throw lastError
  throw new Error(groupText(language, 'All {count} planning candidates failed. Last error: {error}', {
    count: attempted, error: lastError instanceof Error ? lastError.message : 'No usable plan'
  }))
}

/** Release the agent's queue even if a tool-free transport ignores abort. Its
 * late result is discarded; this must never wrap a tool-bearing worker. */
export async function cancellableGroupPlan<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel: (() => void) | undefined
  try {
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(signal.reason ?? new Error('Planning stopped'))
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
    return await Promise.race([cancelled, Promise.resolve().then(() => { signal.throwIfAborted(); return operation() })])
  } finally {
    if (cancel) signal.removeEventListener('abort', cancel)
  }
}

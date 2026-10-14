import { afterEach, expect, it, vi } from 'vitest'
import { firstGroupPlan, planningFailureReason } from './groupPlanning'
afterEach(() => vi.useRealTimers())

it('shows distinct bounded failure reasons without leaking provider details', () => {
  expect(planningFailureReason(new Error('The operation was aborted due to timeout'), 'zh-CN')).toBe('等待规划响应超时')
  expect(planningFailureReason(new Error('Dr. Dou finished without a text response.'), 'zh-CN')).toBe('模型未返回规划内容')
  expect(planningFailureReason(new Error('Invalid group decision mode'), 'zh-CN')).toBe('模型返回的计划格式不符合要求')
  expect(planningFailureReason(new Error('HTTP 401 secret-token'), 'zh-CN')).toBe('规划模型身份验证失败')
})

it('cancels a slow planner before trying the next candidate and ignores its late success', async () => {
  vi.useFakeTimers()
  let slowSignal!: AbortSignal
  let finishSlow!: (value: string) => void
  const next = vi.fn(async () => { expect(slowSignal.aborted).toBe(true); return 'valid backup' })
  const result = firstGroupPlan([{ run: signal => { slowSignal = signal; return new Promise<string>(resolve => { finishSlow = resolve }) } }, { run: next }], new AbortController().signal)
  await vi.advanceTimersByTimeAsync(59_999)
  expect(next).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(await result).toBe('valid backup')
  finishSlow('stale plan')
  await vi.advanceTimersByTimeAsync(1)
  expect(next).toHaveBeenCalledOnce()
})

it('does not call another candidate after a fast success', async () => {
  const spare = vi.fn(async () => 'backup')
  expect(await firstGroupPlan([{ run: async () => 'first' }, { run: spare }], new AbortController().signal)).toBe('first')
  expect(spare).not.toHaveBeenCalled()
})

it('continues beyond two failed candidates without overlapping active attempts', async () => {
  vi.useFakeTimers()
  let first!: AbortSignal
  const third = vi.fn(async () => 'third plan')
  const result = firstGroupPlan([
    { run: signal => { first = signal; return new Promise<never>(() => {}) } },
    { run: async () => { expect(first.aborted).toBe(true); throw new Error('invalid JSON') } },
    { run: third }
  ], new AbortController().signal)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(await result).toBe('third plan')
  expect(third).toHaveBeenCalledOnce()
})

it('reports exhaustion only after all candidates have failed', async () => {
  const candidates = Array.from({ length: 4 }, () => ({ run: vi.fn(async () => { throw new Error('invalid plan') }) }))
  await expect(firstGroupPlan(candidates, new AbortController().signal)).rejects.toThrow('All 4 planning candidates failed')
  candidates.forEach(candidate => expect(candidate.run).toHaveBeenCalledOnce())
})

it('bounds total planning time even when every transport ignores cancellation', async () => {
  vi.useFakeTimers()
  const signals: AbortSignal[] = []
  const candidates = Array.from({ length: 10 }, () => ({ run: (signal: AbortSignal) => { signals.push(signal); return new Promise<never>(() => {}) } }))
  const result = firstGroupPlan(candidates, new AbortController().signal)
  const assertion = expect(result).rejects.toThrow('180 seconds')
  await vi.advanceTimersByTimeAsync(180_001); await assertion
  expect(signals).toHaveLength(3)
  expect(signals.every(signal => signal.aborted)).toBe(true)
})

it('stops immediately on human cancellation instead of moving to another planner', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  let attempt!: AbortSignal
  const spare = vi.fn(async () => 'unused')
  const result = firstGroupPlan([{ run: signal => { attempt = signal; return new Promise<never>(() => {}) } }, { run: spare }], controller.signal)
  const assertion = expect(result).rejects.toThrow('cancelled by human')
  await vi.advanceTimersByTimeAsync(1)
  controller.abort(new Error('cancelled by human'))
  await assertion
  expect(attempt.aborted).toBe(true)
  expect(spare).not.toHaveBeenCalled()
})

it('lets a productive planner run past the old 60 second wall deadline', async () => {
  vi.useFakeTimers()
  let progress!: () => void, finish!: (plan: string) => void
  const spare = vi.fn(async () => 'spare')
  const result = firstGroupPlan([{ run: (_signal, activity) => { progress = activity; return new Promise<string>(resolve => { finish = resolve }) } }, { run: spare }], new AbortController().signal)
  for (let i = 0; i < 3; i++) { await vi.advanceTimersByTimeAsync(30_000); progress() }
  finish('complete plan after 90s')
  expect(await result).toBe('complete plan after 90s')
  expect(spare).not.toHaveBeenCalled()
})
it('still bounds a planner that produces progress forever', async () => {
  vi.useFakeTimers()
  let progress!: () => void
  const result = firstGroupPlan([{ run: (_signal, activity) => { progress = activity; return new Promise<never>(() => {}) } }], new AbortController().signal)
  const assertion = expect(result).rejects.toThrow('180 seconds')
  for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(30_000); progress() }
  await assertion
})
it('skips the same stalled backend but can fail over to another backend', async () => {
  vi.useFakeTimers()
  const duplicate = vi.fn(async () => 'duplicate backend'), backup = vi.fn(async () => 'backup')
  const result = firstGroupPlan([
    { backendKey: 'provider/model', run: () => new Promise<never>(() => {}) },
    { backendKey: 'provider/model', run: duplicate }, { backendKey: 'other/model', run: backup }
  ], new AbortController().signal)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(await result).toBe('backup')
  expect(duplicate).not.toHaveBeenCalled()
})
it('does not suppress another persona after a schema error on the same backend', async () => {
  expect(await firstGroupPlan([
    { backendKey: 'p/m', run: async () => { throw new Error('Invalid plan: wait 60 seconds') } },
    { backendKey: 'p/m', run: async () => 'fixed' }
  ], new AbortController().signal)).toBe('fixed')
})

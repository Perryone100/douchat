import { describe, expect, it, vi } from 'vitest'
import { GroupDecisionService } from './groupDecision'
import type { CustomProviderRecord } from './customModels'
import type { GroupDecisionContext } from '../shared/bot/group'
import { validateDecisionSettings } from '../shared/groupDecision'

const provider: CustomProviderRecord = { id: 'openrouter', name: 'OR', kind: 'openai', apiBase: 'https://openrouter.ai/api', apiKey: 'test-fixture-secret', models: ['ordinary'] }
const group = { id: 'g', name: '项目组', leadMemberId: 'lead', members: [{ id: 'lead', name: '组长' }, { id: 'eng', name: '工程师' }] }
const context: GroupDecisionContext = { messages: [{ id: 'user', role: 'user', content: '请工程师分析性能' }], privateDeliveries: [], completedTurns: [] }
const settings = { mode: 'jev' as const, providerId: 'openrouter', model: 'typesafe/jev-1.13' }
const signal = new AbortController().signal
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })

describe('decision provider', () => {
  it.each(['ordinary', 'typesafe/jev-1.13'])('routes a semantic follow-up to the conversational partner with %s', async model => {
    const followup: GroupDecisionContext = { ...context, requestMessageId: 'followup', messages: [
      { id: 'previous', role: 'user', content: '@工程师 最近有什么待办事项' },
      { id: 'answer', role: 'assistant', sender: group.members[1], content: '要不要建立待办清单？' },
      { id: 'followup', role: 'user', content: '你知道我是谁？' }
    ] }
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(init!.body as string)
      if (model.startsWith('typesafe')) {
        expect(body.state.conversationContinuity.memberId).toBe('eng')
        expect(body.questions.route.instructions).toContain('你知道我是谁')
        return response({ answers: { route: { choice: 'followup', probabilities: { followup: .99 } },
          leader: { choice: 'lead', probabilities: { lead: .99 } }, worker: { choice: 'lead', probabilities: { lead: .99 } } } })
      }
      expect(body.messages[0].content).toContain('"conversationContinuity":{"memberId":"eng"')
      return response({ choices: [{ message: { content: JSON.stringify({ continueConversation: true, mode: 'single', memberIds: ['lead'], leaderMemberId: 'lead', waitForHuman: false }) } }] })
    })
    const result = await new GroupDecisionService(request).decide({ ...settings, model }, { ...provider, apiBase: 'https://fixture.invalid/v1' }, group, followup, signal)
    expect(result).toMatchObject({ addressedMemberId: 'eng', memberIds: ['eng'], leaderMemberId: 'lead' })
    expect(request).toHaveBeenCalledOnce()
  })
  it('uses a compact member-provider plan for default personal participation', async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(init!.body as string)
      expect(body.messages[0].content).toContain('Review only whether')
      return response({ choices: [{ message: { content: JSON.stringify({ participation: true, ordered: true, memberIds: ['eng', 'lead'] }) } }] })
    })
    const decision = await new GroupDecisionService(request).plan({ ...provider, apiBase: 'https://fixture.invalid/v1' }, 'ordinary', group,
      { ...context, requestMessageId: 'user' }, signal, group.members[0], true)
    expect(decision).toMatchObject({ participationOnly: true, mode: 'sequential', memberIds: ['eng', 'lead'] })
    expect(request).toHaveBeenCalledOnce()
  })
  it('does not let a member probe authentication failure disable the configured decision service', async () => {
    const request = vi.fn<typeof fetch>(async input => String(input).includes('broken.test') ? new Response('', { status: 401 })
      : response({ answers: { leader: { choice: 'lead', probabilities: { lead: 1 } }, route: { choice: 'single', probabilities: { single: 1 } }, worker: { choice: 'eng', probabilities: { eng: 1 } }, member_0: { noul: 0 }, member_1: { noul: 1 } } }))
    const service = new GroupDecisionService(request)
    await service.decide(settings, provider, group, context, signal)
    await expect(service.complete({ ...provider, apiBase: 'https://broken.test/v1' }, 'broken', 'PONG', signal)).rejects.toThrow('401')
    await expect(service.decide(settings, provider, group, context, signal)).resolves.toMatchObject({ memberIds: ['eng'] })
  })
  it('calls System One with typed questions and validates the member subset', async () => {
    const request = vi.fn().mockResolvedValue(response({ answers: { leader: { choice: 'lead', probabilities: { lead: 1 } }, route: { choice: 'single', probabilities: { single: 0.97, none: 0.01, parallel: 0.01, plan: 0.01 } }, worker: { choice: 'eng', probabilities: { eng: .97 } }, member_0: { noul: 0.4 }, member_1: { noul: 0.95 } } }))
    const result = await new GroupDecisionService(request).decide(settings, provider, group, context, signal)
    expect(result).toEqual({ leaderMemberId: 'lead', mode: 'single', memberIds: ['eng'], triggerMessageIds: ['user'] })
    expect(request.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/systemone')
    const init = request.mock.calls[0][1]
    expect(init.redirect).toBe('error')
    expect(JSON.parse(init.body).questions.route.type).toBe('choice')
    expect(JSON.parse(init.body).state).not.toHaveProperty('privateDeliveries')
  })
  it('supports an ordinary custom model and rejects unknown recipients', async () => {
    const request = vi.fn<typeof fetch>(async () => response({ choices: [{ message: { content: '{"mode":"single","memberIds":["outsider"],"triggerMessageIds":["user"],"waitForHuman":false}' } }] }))
    await expect(new GroupDecisionService(request).decide({ ...settings, mode: 'model', model: 'ordinary' }, provider, group, context, signal)).rejects.toThrow('unknown member')
    expect(request.mock.calls.at(-1)![0]).toBe('https://openrouter.ai/api/v1/chat/completions')
  })
  it('repairs an incomplete decision schema without changing the selected worker or dispatching work', async () => {
    let completions = 0
    const request = vi.fn<typeof fetch>(async input => String(input).endsWith('/models') ? response({ data: [] })
      : response({ choices: [{ message: { content: JSON.stringify({ leaderMemberId: 'lead', mode: 'single', memberIds: ['lead'], triggerMessageIds: ['user'], ...(++completions > 1 ? { waitForHuman: true } : {}) }) } }] }))
    const decision = await new GroupDecisionService(request).plan(provider, 'ordinary', group, context, signal)
    expect(completions).toBe(2)
    expect(decision).toMatchObject({ waitForHuman: true, memberIds: ['lead'] })
    expect(String(request.mock.calls.at(-1)?.[1]?.body)).toContain('Correct the previous decision schema')
  })
  it('escalates uncertain, conflicting and multi-stage decisions rather than improvising recipients', async () => {
    for (const route of [
      { choice: 'plan', probabilities: { plan: 0.99 } },
      { choice: 'single', probabilities: { single: 0.6 } },
      { choice: 'single', probabilities: { single: 0.99 } }
    ]) {
      const request = vi.fn().mockResolvedValue(response({ answers: { route, member_0: { noul: 0.4 }, member_1: { noul: 0.4 } } }))
      await expect(new GroupDecisionService(request).decide(settings, provider, group, context, signal)).rejects.toThrow()
    }
  })
  it('allows a valid no-reply decision without activating agents', async () => {
    const request = vi.fn().mockResolvedValue(response({ answers: { route: { choice: 'none', probabilities: { none: 0.98 } }, stop: { choice: 'ignore', probabilities: { ignore: 1 } }, needsReply: { noul: 0 } } }))
    expect(await new GroupDecisionService(request).decide(settings, provider, group, context, signal)).toEqual({ mode: 'none', memberIds: [], triggerMessageIds: [] })
  })
  it('opens the circuit after repeated failures, and does not expose provider response bodies', async () => {
    const request = vi.fn(async () => new Response('private provider diagnostics', { status: 503 }))
    const service = new GroupDecisionService(request)
    for (let attempt = 0; attempt < 3; attempt++) await expect(service.decide(settings, provider, group, context, signal)).rejects.toThrow('HTTP 503')
    await expect(service.decide(settings, provider, group, context, signal)).rejects.toThrow('temporarily unavailable')
    expect(request).toHaveBeenCalledTimes(3)
  })
  it('validates settings at the trust boundary', () => {
    expect(() => validateDecisionSettings({ ...settings, model: '' })).toThrow()
    expect(() => validateDecisionSettings({ ...settings, providerId: '../other' })).toThrow()
    expect(() => validateDecisionSettings({ ...settings, healthCheckIntervalSeconds: 0 })).toThrow('30 and 3600')
    expect(() => validateDecisionSettings({ ...settings, healthCheckIntervalSeconds: Number.NaN })).toThrow('30 and 3600')
    expect(validateDecisionSettings({ ...settings, healthCheckIntervalSeconds: 120 }).healthCheckIntervalSeconds).toBe(120)
  })
  it.each([false, true])('uses a roster-constrained output schema, unsupported endpoint=%s', async unsupported => {
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith('/models')) return response({ data: [{ id: 'ordinary', supported_parameters: ['structured_outputs'], reasoning: { mandatory: false } }] })
      const body = JSON.parse(init!.body as string)
      if (unsupported && body.response_format) return new Response('Unsupported schema endpoint', { status: 400 })
      return response({ choices: [{ message: { content: JSON.stringify({ leaderMemberId: 'lead', mode: 'single', memberIds: ['eng'], triggerMessageIds: ['user'], waitForHuman: false,
        addressedMemberId: null, assignments: { lead: '', eng: 'Analyze performance' } }) } }] })
    })
    const decision = await new GroupDecisionService(request).plan(provider, 'ordinary', group, context, signal)
    expect(decision).toMatchObject({ memberIds: ['eng'], assignments: { eng: 'Analyze performance' } })
    const payload = JSON.parse(request.mock.calls[1][1]!.body as string)
    expect(payload.response_format.json_schema.schema.properties.memberIds.items.enum).toEqual(['lead', 'eng'])
    expect(payload.provider.require_parameters).toBe(true)
    if (unsupported) expect(JSON.parse(request.mock.calls.at(-1)![1]!.body as string)).not.toHaveProperty('response_format')
  })
  it.each([false, true])('uses model metadata before disabling reasoning: mandatory=%s', async mandatory => {
    const request = vi.fn<typeof fetch>(async input => String(input).endsWith('/models')
      ? response({ data: [{ id: 'fixture', reasoning: { mandatory } }] })
      : response({ choices: [{ message: { content: '{"ok":true}' } }] }))
    const service = new GroupDecisionService(request)
    await service.complete(provider, 'fixture', 'A bounded question', signal)
    const payload = JSON.parse(request.mock.calls.at(-1)![1]!.body as string)
    expect(payload.reasoning).toEqual(mandatory ? { effort: 'low', exclude: true } : { enabled: false, exclude: true })
    await service.complete(provider, 'fixture', 'Another question', signal)
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/models'))).toHaveLength(1)
  })
  it('does not open the failure circuit for normal low-confidence escalation', async () => {
    const request = vi.fn<typeof fetch>(async () => response({ answers: { route: { choice: 'plan', probabilities: { plan: 0.99 } } } }))
    const service = new GroupDecisionService(request)
    for (let attempt = 0; attempt < 5; attempt++) await expect(service.decide(settings, provider, group, context, signal)).rejects.toThrow('review')
    expect(request).toHaveBeenCalledTimes(5)
  })
})

it.each(['model', 'llm', 'jev'] as const)('routes ordinary models over chat completions even with legacy mode %s', async mode => {
  const request = vi.fn<typeof fetch>(async input => String(input).endsWith('/models') ? response({ data: [] }) : response({ choices: [{ message: { content: JSON.stringify({ mode: 'single', leaderMemberId: 'eng', memberIds: ['eng'], triggerMessageIds: ['user'], waitForHuman: false }) } }] }))
  const result = await new GroupDecisionService(request).decide({ ...settings, mode, model: 'ordinary' }, provider, group, context, signal)
  expect(result.leaderMemberId).toBe('eng')
  expect(request.mock.calls.at(-1)![0]).toBe('https://openrouter.ai/api/v1/chat/completions')
  expect(validateDecisionSettings({ ...settings, mode }).mode).toBe('model')
})

it.each(['skip', 'replace', 'pause'] as const)('asks Jev for a leader and recovery action: %s', async action => {
  const request = vi.fn<typeof fetch>(async () => response({ answers: {
    leader: { choice: 'eng', probabilities: { eng: 1 } }, action: { choice: action, probabilities: { [action]: 1 } },
    replacement: { choice: 'eng', probabilities: { eng: 1 } }
  } }))
  const c = { ...context, unavailableMemberIds: ['lead'], recovery: { failedMemberId: 'lead', participationOnly: action === 'skip', triggerMessageIds: ['user'] } }
  const result = await new GroupDecisionService(request).decide({ ...settings, mode: 'model', model: '~typesafe/jev-latest' }, provider, group, c, signal)
  expect(result).toMatchObject({ recoveryAction: action, leaderMemberId: 'eng', memberIds: action === 'replace' ? ['eng'] : [] })
  const body = JSON.parse(request.mock.calls[0][1]!.body as string)
  expect(body.questions.leader.criteria).toEqual({ eng: '工程师: ' })
  expect(body.state.recovery.failedMemberId).toBe('lead')
  expect(body.questions).not.toHaveProperty('route')
})

it.each(['skip', 'replace', 'pause'] as const)('uses a bounded recovery contract for ordinary LLMs: %s', async action => {
  const request = vi.fn<typeof fetch>(async input => String(input).endsWith('/models') ? response({ data: [{ id: 'ordinary', supported_parameters: ['structured_outputs'] }] }) : response({ choices: [{ message: { content: JSON.stringify({ recoveryAction: action, leaderMemberId: 'eng', replacementMemberId: action === 'replace' ? 'eng' : null }) } }] }))
  const c = { ...context, unavailableMemberIds: ['lead'], recovery: { failedMemberId: 'lead', assignment: 'Complete required work', participationOnly: action === 'skip', triggerMessageIds: ['user'] } }
  const result = await new GroupDecisionService(request).decide({ mode: 'model', providerId: 'openrouter', model: 'ordinary' }, provider, group, c, signal)
  expect(result).toEqual({ leaderMemberId: 'eng', recoveryAction: action, mode: action === 'replace' ? 'single' : 'none', memberIds: action === 'replace' ? ['eng'] : [], triggerMessageIds: action === 'replace' ? ['user'] : [] })
  const body = JSON.parse(request.mock.calls.at(-1)![1]!.body as string)
  expect(body.response_format.json_schema.schema.required).toEqual(['recoveryAction', 'leaderMemberId', 'replacementMemberId'])
  expect(body.messages[0].content).toContain('group_recovery')
})

it.each([false, true])('verifies an initial no-reply decision without overriding the selected model: needsReply=%s', async needsReply => {
  let plans = 0
  const request = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).endsWith('/models')) return response({ data: [] })
    const prompt = JSON.parse(init!.body as string).messages[0].content as string
    const content = prompt.startsWith('Check whether') ? { needsReply } : ++plans === 1
      ? { mode: 'none', memberIds: [], triggerMessageIds: [], waitForHuman: false }
      : { mode: 'single', memberIds: ['eng'], leaderMemberId: 'lead', triggerMessageIds: ['user'], waitForHuman: false }
    return response({ choices: [{ message: { content: JSON.stringify(content) } }] })
  })
  const result = await new GroupDecisionService(request).decide({ mode: 'model', providerId: provider.id, model: 'ordinary' }, provider, group, context, signal)
  expect(result.mode).toBe(needsReply ? 'single' : 'none')
  expect(plans).toBe(needsReply ? 2 : 1)
})

it('lets Jev route an agent-originated group request using its real trigger and private envelopes only', async () => {
  const request = vi.fn<typeof fetch>(async () => response({ answers: { leader: { choice: 'lead', probabilities: { lead: 1 } }, route: { choice: 'single', probabilities: { single: 1 } }, worker: { choice: 'eng', probabilities: { eng: 1 } }, member_0: { noul: 0 }, member_1: { noul: 1 } } }))
  const c: GroupDecisionContext = { requestMessageId: 'posted', messages: [{ id: 'posted', role: 'assistant', sender: { id: 'lead', name: '组长' }, content: '@工程师 请在群里介绍自己' }], completedTurns: [], privateDeliveries: [] }
  const result = await new GroupDecisionService(request).decide(settings, provider, group, c, signal)
  expect(result.triggerMessageIds).toEqual(['posted'])
  expect(JSON.parse(request.mock.calls[0][1]!.body as string).state.latestMessage.id).toBe('posted')
})

it('uses Jev classification for a fresh ordered roll call, preserving unavailable participants for explicit skips', async () => {
  const request = vi.fn<typeof fetch>(async () => response({ answers: {
    leader: { choice: 'lead', probabilities: { lead: .99 } }, route: { choice: 'ordered', probabilities: { ordered: .99 } }
  } }))
  const service = new GroupDecisionService(request)
  const result = await service.decide(settings, provider, group, { ...context, requestMessageId: 'new', unavailableMemberIds: ['eng'], messages: [
    { id: 'old', role: 'assistant', sender: { id: 'lead', name: '组长' }, content: '上一轮报4' }, { id: 'new', role: 'user', content: '报个数' }
  ] }, signal)
  expect(result).toMatchObject({ leaderMemberId: 'lead', mode: 'sequential', participationOnly: true, participantScope: 'all', memberIds: ['lead', 'eng'], triggerMessageIds: ['new'] })
  expect(result.assignments).toBeUndefined()
  expect(JSON.parse(request.mock.calls[0][1]!.body as string).state.fullRoster).toEqual(group.members)
  await expect(service.decide(settings, provider, group, { ...context, completedTurns: [{ round: 1, memberId: 'lead', triggerMessageIds: ['user'], messageIds: ['reply'], privateMessageIds: [] }] }, signal)).rejects.toThrow('continuation')
})

 it('repairs an LLM roll-call plan that omitted unavailable participants and discards stale assignment formats', async () => {
  let calls = 0
  const request = vi.fn<typeof fetch>(async input => String(input).endsWith('/models') ? response({ data: [] }) : response({ choices: [{ message: { content: JSON.stringify({
    leaderMemberId: 'lead', mode: 'sequential', rollCall: true, participationOnly: true, waitForHuman: false,
    memberIds: ++calls === 1 ? ['lead'] : ['lead', 'eng'], triggerMessageIds: ['user'], assignments: { lead: 4, eng: 9 }
  }) } }] }))
  const result = await new GroupDecisionService(request).plan(provider, 'ordinary', group, { ...context, unavailableMemberIds: ['eng'] }, signal)
  expect(calls).toBe(2)
  expect(result.memberIds).toEqual(['lead', 'eng'])
  expect(result.assignments).toBeUndefined()
 })

it.each(['waiting', 'completed'] as const)('keeps Jev stop status explicit: %s', async stop => {
  const request = vi.fn<typeof fetch>(async () => response({ answers: { route: { choice: 'none', probabilities: { none: 1 } },
    stop: { choice: stop, probabilities: { [stop]: 1 } }, needsReply: { noul: 0 } } }))
  const c = { ...context, completedTurns: [{ round: 1, memberId: 'lead', triggerMessageIds: ['user'], messageIds: ['reply'], privateMessageIds: [] }] }
  const result = await new GroupDecisionService(request).decide(settings, provider, group, c, signal)
  expect(result.waitForHuman === true).toBe(stop === 'waiting')
})

it('escalates conflicting silence and premature completion without silently dropping the request', async () => {
  for (const [stop, needsReply] of [['completed', 0], ['ignore', .9], ['waiting', .5]] as const) {
    const request = vi.fn<typeof fetch>(async () => response({ answers: { route: { choice: 'none', probabilities: { none: 1 } },
      stop: { choice: stop, probabilities: { [stop]: 1 } }, needsReply: { noul: needsReply } } }))
    await expect(new GroupDecisionService(request).decide(settings, provider, group, context, signal)).rejects.toThrow('no-reply')
  }
})

it('streams a low-reasoning DeepSeek plan without changing another provider payload', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response('data: {"choices":[{"delta":{"reasoning_content":"private"}}]}\n\ndata: {"choices":[{"delta":{"content":"{\\"ok\\":true}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }))
  const progress = vi.fn(), service = new GroupDecisionService(request)
  expect(await service.complete({ ...provider, apiBase: 'https://api.deepseek.com' }, 'deepseek-flash', 'JSON', signal, undefined, progress)).toBe('{"ok":true}')
  expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toMatchObject({ stream: true, thinking: { type: 'enabled' }, reasoning_effort: 'low' })
  expect(progress).toHaveBeenCalledTimes(2)
  await service.complete({ ...provider, apiBase: 'https://example.test/v1' }, 'other', 'JSON', signal)
  expect(JSON.parse(request.mock.calls[1][1]!.body as string)).not.toHaveProperty('thinking')
})
it.each([false, true])('does not retry transport failure as schema correction, lightweight=%s', async lightweight => {
  const request = vi.fn<typeof fetch>(async () => new Response('private diagnostic', { status: 429 }))
  await expect(new GroupDecisionService(request).plan({ ...provider, apiBase: 'https://fixture.test/v1' }, 'ordinary', group, context, signal, group.members[0], lightweight)).rejects.toThrow('HTTP 429')
  expect(request).toHaveBeenCalledOnce()
})

it('keeps a configured streaming decision alive beyond 40 and 60 seconds', async () => {
  vi.useFakeTimers()
  try {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const request = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ start(controller) { stream = controller } }), { headers: { 'content-type': 'text/event-stream' } }))
    const result = new GroupDecisionService(request).decide({ ...settings, model: 'ordinary' }, { ...provider, apiBase: 'https://fixture.test/v1' }, group, context, signal)
    const encoder = new TextEncoder()
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(30_000)
      stream.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"working"}}]}\n\n'))
    }
    stream.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ mode: 'single', memberIds: ['eng'], leaderMemberId: 'lead', triggerMessageIds: ['user'], waitForHuman: false }) }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`))
    stream.close()
    await expect(result).resolves.toMatchObject({ memberIds: ['eng'] })
    expect(request).toHaveBeenCalledOnce()
  } finally { vi.useRealTimers() }
})

it('requests JSON output for compact DeepSeek completion review too', async () => {
  const request = vi.fn<typeof fetch>(async (_input, init) => {
    const body = JSON.parse(init!.body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
    return response({ choices: [{ message: { content: '{"status":"complete"}' } }] })
  })
  const completed = { ...context, completedTurns: [{ round: 1, memberId: 'eng', messageIds: [], privateMessageIds: [], triggerMessageIds: ['user'] }] }
  await expect(new GroupDecisionService(request).plan({ ...provider, apiBase: 'https://api.deepseek.com' }, 'deepseek-flash', group, completed, signal, group.members[0], true)).resolves.toMatchObject({ mode: 'none' })
  expect(request).toHaveBeenCalledOnce()
})

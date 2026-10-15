import { expect, it, vi } from 'vitest'
import { GroupDecisionService } from './groupDecision'
import type { CustomProviderRecord } from './customModels'

const provider: CustomProviderRecord = { id: 'fixture', name: 'Fixture', kind: 'openai',
  apiBase: 'https://api.deepseek.com', apiKey: 'offline-fixture', models: ['deepseek-flash'] }
const group = { id: 'g', name: '工作组', leadMemberId: 'lead', members: [{ id: 'lead', name: '项目经理' }, { id: 'eng', name: '工程师' }] }
const context = { requestMessageId: 'user', messages: [{ id: 'user', role: 'user' as const, content: '@all 这里是日常办公群' }],
  completedTurns: [], privateDeliveries: [] }
const signal = new AbortController().signal
const active = { mode: 'single', leaderMemberId: 'lead', memberIds: ['eng'], triggerMessageIds: ['user'], waitForHuman: false }
const response = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })

// Verify outgoing requests against the provider contract, without inventing a
// provider rejection in the mock. All model responses below are valid fixtures.
it.each([
  ['https://api.deepseek.com', 'deepseek-flash', false],
  ['https://api.deepseek.com', 'deepseek-flash', true],
  ['https://api.deepseek.com/v1', 'deepseek-flash', false],
  ['https://api.deepseek.com/v1', 'deepseek-flash', true],
  ['https://api.deepseek.com', 'deepseek-v4-pro', false],
  ['https://api.deepseek.com', 'deepseek-v4-pro', true],
] as const)('keeps every DeepSeek JSON request compliant through no-reply review: %s %s %s', async (apiBase, model, needsReply) => {
  let plans = 0
  const payloads: any[] = []
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(init!.body as string)
    payloads.push(body)
    if (body.messages[0].content.startsWith('Check whether')) return response({ needsReply })
    return response(++plans === 1 ? { mode: 'none', memberIds: [], triggerMessageIds: [], waitForHuman: false } : active)
  })
  const result = await new GroupDecisionService(request).plan({ ...provider, apiBase }, model, group, context, signal)
  expect(result.mode).toBe(needsReply ? 'single' : 'none')
  expect(request).toHaveBeenCalledTimes(needsReply ? 3 : 2)
  for (const body of payloads) {
    expect(body).toMatchObject({ model, stream: true, max_tokens: 8192, thinking: { type: 'enabled' }, reasoning_effort: 'low', response_format: { type: 'json_object' } })
    expect(body.messages[0].content).toMatch(/\bJSON\b/i)
  }
  expect(payloads[1].messages[0].content).toContain('{"needsReply":true}')
  expect(payloads[1].messages[0].content).toContain('{"needsReply":false}')
})

it.each([
  ['openai', 'https://fixture.invalid/v1'],
  ['openai', 'https://proxy.fixture.invalid/v1'],
  ['anthropic', 'https://anthropic.fixture.invalid/v1'],
] as const)('preserves the request body for another endpoint: %s %s', async (kind, apiBase) => {
  const request = vi.fn<typeof fetch>(async () => kind === 'anthropic'
    ? Response.json({ content: [{ type: 'text', text: '{"ok":true}' }] }) : response({ ok: true }))
  await new GroupDecisionService(request).complete({ ...provider, kind, apiBase }, 'fixture', 'Return a small object.', signal, { type: 'object' })
  expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({ model: 'fixture', max_tokens: 8192, stream: true,
    messages: [{ role: 'user', content: 'Return a small object.' }] })
  expect(request).toHaveBeenCalledOnce()
})

it('preserves the OpenRouter schema and its unsupported-format fallback', async () => {
  const payloads: any[] = []
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'fixture', supported_parameters: ['structured_outputs'], reasoning: { mandatory: false } }] })
    const body = JSON.parse(init!.body as string)
    payloads.push(body)
    return payloads.length === 1 ? new Response('', { status: 400 }) : response({ ok: true })
  })
  const schema = { type: 'object' }
  await new GroupDecisionService(request).complete({ ...provider, apiBase: 'https://openrouter.ai/api' }, 'fixture', 'Return a small object.', signal, schema)
  const base = { model: 'fixture', max_tokens: 8192, stream: true, reasoning: { enabled: false, exclude: true },
    messages: [{ role: 'user', content: 'Return a small object.' }] }
  expect(payloads).toEqual([{ ...base, response_format: { type: 'json_schema', json_schema: { name: 'group_decision', strict: true, schema } },
    provider: { require_parameters: true } }, base])
})

it('does not turn a DeepSeek plain-text probe into a JSON request', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content: 'PONG' } }] }))
  await expect(new GroupDecisionService(request).complete(provider, 'deepseek-flash', 'Reply PONG.', signal)).resolves.toBe('PONG')
  expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({ model: 'deepseek-flash', max_tokens: 8192, stream: true,
    thinking: { type: 'enabled' }, reasoning_effort: 'low', messages: [{ role: 'user', content: 'Reply PONG.' }] })
})

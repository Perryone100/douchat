import { expect, it, vi } from 'vitest'
import { createModels, type AssistantMessage, type Context, type Message } from '@earendil-works/pi-ai'
import { CHECKPOINT_FIELDS, ModelContextManager, memberFailureReason, ModelContextLimitError, deduplicateGroupContext, type ContextCheckpoint, type ContextSummary } from './modelContext'
import { customModelProvider } from './customModels'

const model = { contextWindow: 128000, maxTokens: 8192 }
const user = (content: string): Message => ({ role: 'user', content, timestamp: 1 })
const assistant = (tokens = 0): AssistantMessage => ({ role: 'assistant', content: [{ type: 'text', text: 'Previous result' }],
  api: 'openai-completions', model: 'test', provider: 'custom:test', stopReason: 'stop', timestamp: 2,
  usage: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: tokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } })
const summary: ContextSummary = { goalsAndConstraints: ['Tablet only. Do not change business flow.'], decisions: ['Landscape 3:2'], completedWork: ['report.md saved; do not write it again.'], pendingWork: ['Review result'], references: ['report.md'], uncertainties: ['No usability test yet'] }
function hooks() {
  return { summarize: vi.fn(async (_context: Context) => JSON.stringify(summary)), save: vi.fn((checkpoint: ContextCheckpoint) => checkpoint), onEvent: vi.fn() }
}

it('makes no summary call for a small request and retains system prompt, tools and usage', async () => {
  const h = hooks(), context = { systemPrompt: 'Keep user rules', messages: [user('Hello'), assistant(500), user('Continue')] }
  const next = await new ModelContextManager().prepare(context, model, h)
  expect(next).toEqual(context)
  expect(h.summarize).not.toHaveBeenCalled()
})

it('summarizes old exchanges, preserves early constraints and current tool pairs, and archives original evidence', async () => {
  const call: AssistantMessage = { ...assistant(136747), stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'write-1', name: 'write_file', arguments: { path: 'report.md' } }] }
  const result: Message = { role: 'toolResult', toolCallId: 'write-1', toolName: 'write_file', content: [{ type: 'text', text: 'Saved report.md. Do not write it again.' }], isError: false, timestamp: 3 }
  const current = [user('Read the result and report back'), call, result]
  const context: Context = { systemPrompt: 'Keep user rules', messages: [user('Tablet only. Do not change business flow.'), assistant(), ...current] }
  const before = structuredClone(context), h = hooks(), manager = new ModelContextManager()
  const next = await manager.prepare(context, model, h)
  expect(h.summarize).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(h.summarize.mock.calls[0][0])).toContain('Do not change business flow')
  expect(JSON.stringify(next.messages[0])).toContain('Do not change business flow')
  expect(next.messages[1]).toBe(current[0])
  expect(next.messages[2].content).toEqual(call.content)
  expect(next.messages[3]).toBe(result)
  expect(next.systemPrompt).toBe(context.systemPrompt)
  expect(h.save.mock.calls[0][0].messages).toEqual(context.messages.slice(0, 2))
  expect(context).toEqual(before)
  // Same checkpoint, no second summary; canonical session can keep growing.
  await manager.prepare({ ...context, messages: [...context.messages, assistant(1500), user('Continue')] }, model, h)
  expect(h.summarize).toHaveBeenCalledTimes(1)
})

it('does not truncate the current task, split tool pairs or drop system instructions to fit', async () => {
  const context: Context = { messages: [user('Old request'), assistant(), user('Current request'),
    { ...assistant(), stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'read-1', name: 'read_file', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'read-1', toolName: 'read_file', content: [{ type: 'text', text: '大文件'.repeat(40000) }], isError: false, timestamp: 3 }] }
  const before = structuredClone(context), h = hooks()
  await expect(new ModelContextManager().prepare(context, model, h)).rejects.toThrow(ModelContextLimitError)
  await expect(new ModelContextManager().prepare({ systemPrompt: 'x'.repeat(600000), messages: [user('a'), assistant(), user('b')] }, model, h)).rejects.toThrow(ModelContextLimitError)
  expect(context).toEqual(before)
  expect(h.summarize).not.toHaveBeenCalled()
})

it('uses the selected context window and leaves a large-context model untouched', async () => {
  const context = { messages: [user('x'.repeat(270000)), assistant(), user('Current task')] }, h = hooks()
  await new ModelContextManager().prepare(context, { contextWindow: 1000000, maxTokens: 32000 }, h)
  expect(h.summarize).not.toHaveBeenCalled()
  await new ModelContextManager().prepare(context, { contextWindow: 128000, maxTokens: 32000 }, h)
  expect(h.summarize).toHaveBeenCalledTimes(1)
})

it('accounts for images without treating base64 bytes as text', async () => {
  const context: Context = { messages: [{ role: 'user', content: [{ type: 'image', data: 'x'.repeat(1000000), mimeType: 'image/png' }], timestamp: 1 }] }, h = hooks()
  await new ModelContextManager().prepare(context, model, h)
  expect(h.summarize).not.toHaveBeenCalled()
})

it('restores the real SDK output budget without losing the archived constraint or current tool results', async () => {
  const models = createModels()
  models.setProvider(customModelProvider({ id: 'test', name: 'Test', kind: 'openai', apiBase: 'https://fixture.invalid/v1', apiKey: 'fixture', models: ['test'] }))
  const selected = models.getModel('custom:test', 'test')!
  const context: Context = { messages: [user('Old exchange'), assistant(), user('Current task'),
    { ...assistant(136747), stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'read-1', name: 'read_file', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'read-1', toolName: 'read_file', content: [{ type: 'text', text: 'Existing evidence' }], isError: false, timestamp: 3 }] }
  const payloads: any[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    payloads.push(await new Request(input, init).json())
    return new Response('data: {"choices":[{"delta":{"content":"Done"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  await models.completeSimple(selected, context, { fetch })
  const prepared = await new ModelContextManager().prepare(context, selected, hooks())
  await models.completeSimple(selected, prepared, { fetch })
  expect(payloads[0].max_tokens).toBe(1)
  expect(payloads[1].max_tokens).toBe(8192)
  expect(payloads[1].messages.some((m: any) => m.role === 'tool' && m.tool_call_id === 'read-1')).toBe(true)
  expect((context.messages[3] as AssistantMessage).usage.totalTokens).toBe(136747)
})

it('deduplicates exact public message copies only, retaining unique old requirements, changed versions and latest input', () => {
  const frame = (entries: any[], assignment: string) => user('You are the current member in a group conversation.\n' + JSON.stringify({ group: { name: 'Test' }, human: { id: 'human' }, currentBot: { id: 'bot' }, messages: entries, turn: { assignment } }))
  const oldRequirement = { id: 'r1', content: 'No business-flow changes' }, repeated = { id: 'r2', content: 'Landscape' }
  const context: Context = { messages: [frame([oldRequirement, repeated, { id: 'r3', content: 'old' }], 'Earlier work'), assistant(136747), frame([repeated, { id: 'r3', content: 'new' }], 'Current work')] }
  const before = structuredClone(context), result = deduplicateGroupContext(context)
  expect(result.removedCopies).toBe(1)
  expect(JSON.stringify(result.context.messages[0])).toContain('No business-flow changes')
  expect(JSON.stringify(result.context.messages[0])).toContain('Earlier work')
  expect(JSON.stringify(result.context.messages[0])).not.toContain('Landscape')
  expect(JSON.stringify(result.context.messages[0])).toContain('old')
  expect(result.context.messages[2]).toBe(context.messages[2])
  expect(context).toEqual(before)
})

it.each(['not JSON', '{}', JSON.stringify(Object.fromEntries(CHECKPOINT_FIELDS.map(k => [k, []])))])('never deletes history or saves a checkpoint after invalid summary: %s', async reply => {
  const context = { messages: [user('Unique old fact'), assistant(136747), user('Continue')] }, before = structuredClone(context), h = hooks()
  h.summarize.mockResolvedValue(reply)
  await expect(new ModelContextManager().prepare(context, model, h)).rejects.toThrow(ModelContextLimitError)
  expect(context).toEqual(before)
  expect(h.save).not.toHaveBeenCalled()
  expect(h.summarize).toHaveBeenCalledTimes(1)
})

it('persists no partial checkpoint on cancellation and rejects evidence above its call budget before calling a model', async () => {
  const h = hooks(), abort = new AbortController()
  h.summarize.mockImplementation(async () => { abort.abort(); return JSON.stringify(summary) })
  await expect(new ModelContextManager().prepare({ messages: [user('Old fact'), assistant(136747), user('Continue')] }, model, { ...h, signal: abort.signal })).rejects.toThrow()
  expect(h.save).not.toHaveBeenCalled()
  const other = hooks()
  await expect(new ModelContextManager().prepare({ messages: [user('需求'.repeat(100000)), assistant(), user('Continue')] }, model, other)).rejects.toThrow(ModelContextLimitError)
  expect(other.summarize).not.toHaveBeenCalled()
})

it('reloads a saved checkpoint in a new session without another summarization request', async () => {
  const h = hooks(), manager = new ModelContextManager()
  await manager.prepare({ messages: [user('Old fact'), assistant(136747), user('Continue')] }, model, h)
  const saved = h.save.mock.calls[0][0], reloaded = new ModelContextManager(saved), nextHooks = hooks()
  const next = await reloaded.prepare({ messages: [user('What remains?')] }, model, nextHooks)
  expect(JSON.stringify(next.messages[0])).toContain('Tablet only')
  expect(nextHooks.summarize).not.toHaveBeenCalled()
})

it.each([
  ['maximum context length exceeded', 'The conversation context is too long'],
  ['model output limit reached', 'The model output limit was reached'],
  ['response timed out after 120 seconds', 'The model reply timed out'],
  ['429 rate limit', 'The model service is rate limited'],
  ['401 invalid api key: PRIVATE_KEY', 'The model could not authenticate'],
  ['PRIVATE_TOOL_BODY', 'The model returned no usable reply']
])('classifies failures without disclosing provider details: %s', (raw, expected) => {
  expect(memberFailureReason(raw)).toBe(expected)
})

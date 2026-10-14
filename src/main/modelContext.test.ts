import { expect, it } from 'vitest'
import { createModels, type AssistantMessage, type Context, type Message } from '@earendil-works/pi-ai'
import { boundModelContext, memberFailureReason, ModelContextLimitError } from './modelContext'
import { customModelProvider } from './customModels'

const model = { contextWindow: 128000, maxTokens: 8192 }
const user = (content: string): Message => ({ role: 'user', content, timestamp: 1 })
const assistant = (tokens = 0): AssistantMessage => ({ role: 'assistant', content: [{ type: 'text', text: 'Previous result' }],
  api: 'openai-completions', model: 'test', provider: 'custom:test', stopReason: 'stop', timestamp: 2,
  usage: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: tokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } })

it('leaves a small request and its system prompt, tools and usage unchanged', () => {
  const context = { systemPrompt: 'Keep user rules', messages: [user('Hello'), assistant(500), user('Continue')] }
  expect(boundModelContext(context, model)).toMatchObject({ context, removedMessages: 0 })
  expect(boundModelContext(context, model).context).toBe(context)
})

it('removes complete old exchanges including images, retaining the current request and complete tool pairs', () => {
  const call: AssistantMessage = { ...assistant(136747), stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'write-1', name: 'write_file', arguments: { path: 'report.md' } }] }
  const result: Message = { role: 'toolResult', toolCallId: 'write-1', toolName: 'write_file', content: [{ type: 'text', text: 'Saved report.md. Do not write it again.' }], isError: false, timestamp: 3 }
  const current = [user('Read the result and report back'), call, result]
  const context: Context = { systemPrompt: 'Keep user rules', messages: [user('需求'.repeat(40000)), assistant(), ...current] }
  const before = structuredClone(context)
  const bounded = boundModelContext(context, model)
  expect(bounded.removedMessages).toBe(2)
  expect(bounded.context.messages[0]).toBe(current[0])
  expect(bounded.context.messages[1].content).toEqual(call.content)
  expect(bounded.context.messages[2]).toBe(result)
  expect(bounded.context.systemPrompt).toContain('Keep user rules')
  expect(bounded.context.systemPrompt).toContain('older complete exchanges were omitted')
  expect(bounded.estimatedTokens).toBeLessThan(bounded.budget)
  expect(context).toEqual(before)
})

it('does not truncate a current task, split tool pairs or silently drop system instructions to fit', () => {
  const context: Context = { messages: [user('Old request'), assistant(), user('Current request'),
    { ...assistant(), stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'read-1', name: 'read_file', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'read-1', toolName: 'read_file', content: [{ type: 'text', text: '大文件'.repeat(40000) }], isError: false, timestamp: 3 }] }
  const before = structuredClone(context)
  expect(() => boundModelContext(context, model)).toThrow(ModelContextLimitError)
  expect(context).toEqual(before)
  expect(() => boundModelContext({ systemPrompt: 'x'.repeat(600000), messages: [user('a'), assistant(), user('b')] }, model)).toThrow(ModelContextLimitError)
})

it('respects the selected window and reserves a reasoning model output budget', () => {
  const context = { messages: [user('x'.repeat(270000)), assistant(), user('Current task')] }
  expect(boundModelContext(context, { contextWindow: 1000000, maxTokens: 32000 }).removedMessages).toBe(0)
  expect(boundModelContext(context, { contextWindow: 128000, maxTokens: 32000 }).removedMessages).toBe(2)
})

it('uses a bounded image allowance instead of charging base64 bytes as text', () => {
  const context: Context = { messages: [{ role: 'user', content: [{ type: 'image', data: 'x'.repeat(1000000), mimeType: 'image/png' }], timestamp: 1 }] }
  expect(boundModelContext(context, model).removedMessages).toBe(0)
})

it('restores the real SDK output budget after pruning usage from the original oversized prefix', async () => {
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
  const bounded = boundModelContext(context, selected)
  const reply = await models.completeSimple(selected, bounded.context, { fetch })
  expect(payloads[0].max_tokens).toBe(1)
  expect(payloads[1].max_tokens).toBe(8192)
  expect(reply.stopReason).toBe('stop')
  expect(payloads[1].messages.some((m: any) => m.role === 'tool' && m.tool_call_id === 'read-1')).toBe(true)
  expect((context.messages[3] as AssistantMessage).usage.totalTokens).toBe(136747)
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

import { expect, it, vi } from 'vitest'
import { readDecisionResponse } from './decisionStream'
const signal = new AbortController().signal
const sse = (data: string) => new Response(data, { headers: { 'content-type': 'text/event-stream' } })
const event = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`

it('reads arbitrarily split UTF-8 and CRLF, counts reasoning but never returns it', async () => {
  const progress = vi.fn()
  const bytes = new TextEncoder().encode(': keepalive\r\n\r\n' + event({ choices: [{ delta: { reasoning_content: 'private thinking' } }] })
    + event({ choices: [{ delta: { content: '{"结果":"完成"}' } }] }) + event({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\r\n\r\n')
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } })
  const result = await readDecisionResponse(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), 'openai', signal, progress)
  expect(result.choices[0].message.content).toBe('{"结果":"完成"}')
  expect(JSON.stringify(result)).not.toContain('private thinking')
  expect(progress).toHaveBeenCalledTimes(2)
})
it('accepts Anthropic text/thinking events while ignoring ping heartbeats', async () => {
  const progress = vi.fn()
  const result = await readDecisionResponse(sse(event({ type: 'ping' })
    + event({ type: 'content_block_start', content_block: { type: 'text', text: '{' } })
    + event({ type: 'content_block_delta', delta: { thinking: 'private' } })
    + event({ type: 'content_block_delta', delta: { text: '"ok":true}' } })
    + event({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + event({ type: 'message_stop' })), 'anthropic', signal, progress)
  expect(result.content).toEqual([{ type: 'text', text: '{"ok":true}' }])
  expect(progress).toHaveBeenCalledTimes(3)
})
it.each([
  [event({ choices: [{ delta: { content: '{}' } }] }), 'before completion'],
  [event({ choices: [{ delta: { content: '{}' }, finish_reason: 'length' }] }), 'output limit'],
  [event({ choices: [{ delta: {}, finish_reason: 'error' }] }), 'streaming error'],
  [event({ error: { message: 'secret provider detail' } }), 'streaming error']
])('rejects incomplete or failed streams', async (body, error) => {
  await expect(readDecisionResponse(sse(body), 'openai', signal)).rejects.toThrow(error)
})
it('cancels a stalled reader promptly even if the server ignores abort', async () => {
  const controller = new AbortController(), cancel = vi.fn()
  const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'text/event-stream' } })
  const promise = readDecisionResponse(response, 'openai', controller.signal)
  controller.abort(new Error('human stopped'))
  await expect(promise).rejects.toThrow('human stopped')
  expect(cancel).toHaveBeenCalledOnce()
})
it('retains compatibility with JSON responses', async () => {
  const data = { choices: [{ message: { content: '{}' } }] }
  expect(await readDecisionResponse(Response.json(data), 'openai', signal)).toEqual(data)
})

it('does not mistake large repeated SSE envelopes for a large plan', async () => {
  const envelope = { id: 'metadata'.repeat(300), choices: [{ delta: { reasoning_content: 'x' } }] }
  const body = event(envelope).repeat(1000) + event({ choices: [{ delta: { content: '{}' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n'
  expect(body.length).toBeGreaterThan(2_000_000)
  expect((await readDecisionResponse(sse(body), 'openai', signal)).choices[0].message.content).toBe('{}')
})
it('does not count keepalives, roles or usage packets as model progress', async () => {
  const progress = vi.fn()
  await readDecisionResponse(sse(': ping\n\n' + event({ choices: [{ delta: { role: 'assistant', content: '' } }] })
    + event({ choices: [], usage: { total_tokens: 4 } }) + 'data: [DONE]\n\n'), 'openai', signal, progress)
  expect(progress).not.toHaveBeenCalled()
})
it('rejects a truncated non-streamed response even when its prefix is valid JSON', async () => {
  await expect(readDecisionResponse(Response.json({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }), 'openai', signal)).rejects.toThrow('output limit')
})

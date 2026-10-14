/** Transport failures must not enter the JSON/schema correction loop. */
export class DecisionTransportError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

/** Read planning output incrementally. Heartbeats are not model progress and
 * reasoning content is never returned to the caller or persisted in diagnostics. */
export async function readDecisionResponse(response: Response, kind: 'openai' | 'anthropic',
  signal: AbortSignal, onProgress?: () => void): Promise<any> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json()
    if (data.error) throw new DecisionTransportError('The planning service reported an error.')
    const reason = kind === 'anthropic' ? data.stop_reason : data.choices?.[0]?.finish_reason
    if (reason === 'length' || reason === 'max_tokens') throw new DecisionTransportError('The planning response reached its output limit before completing the plan.')
    if (reason === 'error') throw new DecisionTransportError('The planning service reported a streaming error.')
    return data
  }
  if (!response.body) throw new DecisionTransportError('The planning service returned an empty stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', text = '', finishReason: string | undefined
  let bytes = 0, ended = false
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const event = (block: string) => {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data) return
    if (data === '[DONE]') { ended = true; return }
    let value: any
    try { value = JSON.parse(data) } catch { throw new DecisionTransportError('The planning service returned an invalid stream event.') }
    if (value.error || value.type === 'error') throw new DecisionTransportError('The planning service reported a streaming error.')
    if (kind === 'anthropic') {
      if (value.type === 'content_block_start' && typeof value.content_block?.text === 'string') {
        text += value.content_block.text
        if (value.content_block.text) onProgress?.()
      }
      if (value.type === 'content_block_delta') {
        if (typeof value.delta?.text === 'string') { text += value.delta.text; if (value.delta.text) onProgress?.() }
        else if (typeof value.delta?.thinking === 'string' && value.delta.thinking) onProgress?.()
      }
      if (value.type === 'message_delta' && value.delta?.stop_reason) finishReason = value.delta.stop_reason
      if (value.type === 'message_stop') ended = true
    } else {
      const choice = value.choices?.[0]
      if (typeof choice?.delta?.content === 'string') { text += choice.delta.content; if (choice.delta.content) onProgress?.() }
      if (typeof choice?.delta?.reasoning_content === 'string' && choice.delta.reasoning_content) onProgress?.()
      if (typeof choice?.delta?.reasoning === 'string' && choice.delta.reasoning) onProgress?.()
      if (choice?.finish_reason) finishReason = choice.finish_reason
    }
  }
  try {
    signal.throwIfAborted()
    while (!ended) {
      const part = await reader.read()
      signal.throwIfAborted()
      if (part.done) break
      // SSE envelopes repeat model metadata for every token; bound wire bytes
      // separately from the much smaller assembled plan.
      bytes += part.value.byteLength
      if (bytes > 16_000_000) throw new DecisionTransportError('The planning response exceeded its size limit.')
      buffer += decoder.decode(part.value, { stream: true })
      // Normalise only complete CRLF pairs; a CR may straddle network chunks.
      buffer = buffer.replace(/\r\n/g, '\n')
      let index: number
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index); buffer = buffer.slice(index + 2)
        event(block)
        if (ended) break
      }
    }
    if (!ended && buffer.trim()) event(buffer + decoder.decode())
    if (!ended && !finishReason) throw new DecisionTransportError('The planning stream ended before completion.')
    if (finishReason === 'error') throw new DecisionTransportError('The planning service reported a streaming error.')
    if (finishReason === 'length' || finishReason === 'max_tokens') throw new DecisionTransportError('The planning response reached its output limit before completing the plan.')
    signal.throwIfAborted()
    return kind === 'anthropic' ? { content: [{ type: 'text', text }] }
      : { choices: [{ message: { content: text }, finish_reason: finishReason }] }
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

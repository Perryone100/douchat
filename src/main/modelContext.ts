import type { Context, Message } from '@earendil-works/pi-ai'

type ModelBudget = { contextWindow?: number; maxTokens?: number }
const OMISSION = 'Some older complete exchanges were omitted from this model request to reserve room for the answer. The chat record is unchanged. Do not assume omitted facts or repeat actions that may already have completed; use the current request, retained evidence and available records, or ask for the missing detail.'

// Conservative estimate including CJK and tool schemas, not an exact tokenizer.
// Images receive an allowance instead of counting their base64 as text.
function textTokens(text: string): number {
  let ascii = 0, unicode = 0
  for (const char of text) char.codePointAt(0)! < 128 ? ascii++ : unicode++
  return Math.ceil(ascii / 3 + unicode * 1.5)
}
function messageTokens(message: Message): number {
  if (typeof message.content === 'string') return textTokens(message.content) + 16
  return message.content.reduce((total, part) => total + (part.type === 'image' ? 4096
    : part.type === 'text' ? textTokens(part.text)
      : part.type === 'thinking' ? textTokens(part.thinking)
        : textTokens(part.name + JSON.stringify(part.arguments))), 16)
}
function clearUsage(message: Message): Message {
  if (message.role !== 'assistant') return message
  // Usage describes the ORIGINAL prefix. Keeping it after pruning makes pi-ai
  // clamp max_tokens to 1 even when the new request is small. Only the outbound
  // copy changes; diagnostics and the session transcript retain their usage.
  return { ...message, usage: { ...message.usage, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 0 } }
}

export class ModelContextLimitError extends Error {
  constructor() {
    super('The current task exceeds the model context budget. Its request and tool results were preserved. Use a smaller input or a larger-context model; completed actions will not be repeated automatically.')
    this.name = 'ModelContextLimitError'
  }
}

/** Bound every hosted request, including tool continuations. Drop whole older
 * user exchanges, never the current request or its tool-call/result chain.
 * This trims requests; it is not a semantic summary or a chat-memory mutation. */
export function boundModelContext(context: Context, model: ModelBudget) {
  const window = Number.isFinite(model.contextWindow) && model.contextWindow! > 0 ? model.contextWindow! : 128000
  const reserve = Math.min(Number.isFinite(model.maxTokens) && model.maxTokens! > 0 ? model.maxTokens! : 8192, Math.floor(window / 2))
  const budget = Math.max(1, window - reserve - Math.max(4096, Math.ceil(window * 0.1)))
  const prefix = textTokens(context.systemPrompt ?? '') + textTokens(JSON.stringify(context.tools ?? []))
  const sizes = context.messages.map(messageTokens)
  let estimated = prefix + sizes.reduce((a, b) => a + b, 0)
  // The SDK uses the latest successful assistant usage plus trailing messages.
  // Check that estimate too, so a huge old prefix cannot silently starve output.
  for (let i = context.messages.length - 1; i >= 0; i--) {
    const m = context.messages[i]
    if (m.role !== 'assistant' || m.stopReason === 'error' || m.stopReason === 'aborted' || !m.usage) continue
    const measured = m.usage.totalTokens || m.usage.input + m.usage.output + m.usage.cacheRead + m.usage.cacheWrite
    if (measured > 0) { estimated = Math.max(estimated, prefix + measured + sizes.slice(i + 1).reduce((a, b) => a + b, 0)); break }
  }
  if (estimated <= budget) return { context, removedMessages: 0, estimatedTokens: estimated, budget }

  const starts = context.messages.flatMap((m, i) => m.role === 'user' ? [i] : [])
  const currentStart = starts.at(-1) ?? 0
  let removed = 0
  let remaining = prefix + sizes.reduce((a, b) => a + b, 0) + textTokens(OMISSION)
  for (const start of starts.slice(1)) {
    for (let i = removed; i < start; i++) remaining -= sizes[i]
    removed = start
    if (remaining <= budget) break
  }
  if (!removed || removed > currentStart || remaining > budget) throw new ModelContextLimitError()
  return {
    context: { ...context, systemPrompt: [context.systemPrompt, OMISSION].filter(Boolean).join('\n\n'), messages: context.messages.slice(removed).map(clearUsage) },
    removedMessages: removed, estimatedTokens: remaining, budget
  }
}

/** Never expose provider bodies, credentials or private tool output in notices. */
export function memberFailureReason(error?: string): string {
  if (/context.{0,40}(?:budget|length|limit|window|exceed)|maximum context|too many tokens|prompt.{0,20}too long/i.test(error ?? '')) return 'The conversation context is too long'
  if (/output limit|output budget|finish_reason.{0,5}length/i.test(error ?? '')) return 'The model output limit was reached'
  if (/timeout|timed out|超时/i.test(error ?? '')) return 'The model reply timed out'
  if (/429|rate.?limit/i.test(error ?? '')) return 'The model service is rate limited'
  if (/401|403|auth|api.?key/i.test(error ?? '')) return 'The model could not authenticate'
  return 'The model returned no usable reply'
}

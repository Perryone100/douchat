/** Opt-in paid live QA. Reads dev provider credentials in memory; all tasks and
 * persisted results belong to an isolated synthetic database. Never logs keys. */
import { app, safeStorage } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CustomModelStore } from '../src/main/customModels'
import { DouchatStore } from '../src/main/store'
import { DouchatRuntime } from '../src/main/runtime'
import { configureLocalAgentRegistry } from '../src/main/localAgents'
import { GroupDecisionService } from '../src/main/groupDecision'
import { firstGroupPlan } from '../src/main/groupPlanning'
import type { GroupDecision } from '../src/shared/bot/group'
import type { ComputerProvider } from '../src/main/computer'

if (process.env.DOUCHAT_LIVE_SCENARIOS !== '1') throw new Error('Set DOUCHAT_LIVE_SCENARIOS=1 to authorize paid model calls.')
app.setName('Douchat Dev')
const sourceDirectory = process.env.DOUCHAT_QA_USER_DATA || join(app.getPath('appData'), 'douchat-dev')
app.setPath('userData', sourceDirectory)
const output = join(process.cwd(), 'out', 'group-scenarios', `timeouts-${Date.now()}`)
mkdirSync(output, { recursive: true })
async function main() {
  await app.whenReady()
  const source = new DatabaseSync(join(sourceDirectory, 'douchat.db'), { readOnly: true })
  const account = (source.prepare("SELECT value FROM meta WHERE key = 'currentAccountId'").get() as { value: string }).value
  source.close()
  const records = new CustomModelStore(join(sourceDirectory, 'custom-models'), {
    encrypt: () => { throw new Error('Read only') }, decrypt: value => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }).records(account)
  const provider = records.find(record => record.id === process.env.DOUCHAT_QA_PROVIDER)
  if (!provider) throw new Error('Choose a configured provider using DOUCHAT_QA_PROVIDER.')
  const model = process.env.DOUCHAT_QA_MODEL || provider.models[0]
  const report: Record<string, unknown>[] = []
  const record = (result: Record<string, unknown>) => {
    report.push(result); writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(result))
  }
  if (process.argv.includes('--context-only')) {
    const store = new DouchatStore(join(output, 'synthetic.db'))
    store.setCurrentAccountId('synthetic-context-qa')
    const computer: ComputerProvider = { snapshots: () => [], createTools: () => [], start: async () => { throw new Error('Disabled for QA') }, stop: async () => {}, show: async () => {}, dispose: () => {} }
    const runtime = new DouchatRuntime(store, computer, () => {})
    runtime.configureCustomModels([provider])
    const agent = store.createAgent({ name: 'Context QA', role: 'Text-only verifier', instructions: 'Answer only the current request. Do not call tools.', color: '#6366f1', provider: `custom:${provider.id}`, model, thinkingLevel: 'low' })
    const conversation = store.ensureDirectConversation(agent.id).conversation
    const sessionKey = `direct:${conversation.id}:context-qa`
    const internal = runtime as any
    let requests = 0
    const stream = internal.models.streamSimple.bind(internal.models)
    internal.models.streamSimple = (...args: unknown[]) => { requests++; return stream(...args) }
    const session = internal.session(agent, sessionKey, 'direct', true)
    // Reproduce accumulated history and usage without sending private content
    // or paying to generate an oversized transcript.
    session.state.messages = [
      { role: 'user', content: '旧的合成测试上下文。'.repeat(6000), timestamp: 1 },
      { role: 'assistant', api: 'openai-completions', provider: agent.provider, model, timestamp: 2,
        content: [{ type: 'text', text: 'Earlier synthetic work completed.' }], stopReason: 'stop',
        usage: { input: 131882, output: 1, cacheRead: 4864, cacheWrite: 0, totalTokens: 136747, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
    ]
    const run = store.createRun({ agentId: agent.id, conversationId: conversation.id, title: 'Context budget QA', prompt: 'Return CONTEXT_OK', trigger: 'chat' })
    const start = Date.now()
    const reply = await internal.runReply({ config: agent, sessionKey, context: 'direct', prompt: '这是独立测试。本次只回复 CONTEXT_OK，不做其他操作。',
      conversationId: conversation.id, topicId: conversation.activeTopicId, runId: run.id, toolsDisabled: true, timeoutMs: 60000 })
    const trims = store.runEvents.filter(event => event.runId === run.id && event.label === 'Model context compacted')
    const passed = !reply.error && reply.text.includes('CONTEXT_OK') && trims.length > 0
    const usage = session.state.messages.at(-1)?.usage
    record({ scenario: 'long-context-reply', passed, elapsedMs: Date.now() - start, requests, text: reply.text, error: reply.error,
      tokens: usage ? { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, reasoning: usage.reasoning } : undefined,
      trims: trims.map(event => event.detail) })
    store.close()
    console.log(`REPORT ${output}`)
    app.exit(passed ? 0 : 1)
    return
  }
  const group = { id: 'qa', name: 'Synthetic project', leadMemberId: 'pm', members: [
    { id: 'pm', name: '项目经理', description: '分工、协调、总结' },
    { id: 'product', name: '产品专家', description: '需求分析、文档' },
    { id: 'review', name: '评审专家', description: '独立检查范围与验收标准' }
  ] }
  const content = process.argv.includes('--dag') ? '请合作交付内部预约系统需求包，约束是20人试用、创建和取消预约、不含支付。拆成5项实际任务：产品专家起草需求；评审专家独立整理边界约束，这两项可并行；产品专家拿到两份实际结果后修订需求；评审专家审查修订稿并给可测试的验收清单；项目经理基于所有实际产出汇总。每项150字以内，无需提问，不调用外部工具。' : '请合作完成一个预约系统的需求分析。已知只做内部20人试用，支持创建预约、取消预约，不含支付。产品专家先给需求范围，评审专家基于需求检查边界和验收标准，项目经理最后汇总完整结论。每人150字以内，直接完成，无需提问，不操作外部系统。'
  const context = { requestMessageId: 'request', messages: [{ id: 'request', role: 'user' as const, content }], privateDeliveries: [], completedTurns: [] }
  const started = Date.now(); let firstProgressMs: number | undefined, progressEvents = 0
  const trace = (service: GroupDecisionService) => {
    const complete = service.complete.bind(service)
    let sequence = 0
    service.complete = async (...args) => {
      const start = Date.now(), id = ++sequence
      const result = await complete(...args)
      writeFileSync(join(output, `decision-${Date.now()}-${id}.json`), JSON.stringify({ elapsedMs: Date.now() - start, prompt: args[2], result }, null, 2))
      return result
    }
  }
  const service = new GroupDecisionService()
  trace(service)
  const plan = await firstGroupPlan([{ run: (signal, progress) => service.plan(provider, model, group, context, signal, group.members[0], false, () => {
    firstProgressMs ??= Date.now() - started; progressEvents++; progress()
  }) }], new AbortController().signal)
  record({ scenario: 'streamed-plan', elapsedMs: Date.now() - started, firstProgressMs, progressEvents, passed: plan.mode !== 'none' && !plan.participationOnly, plan })
  if (process.argv.includes('--probe-only')) { app.exit(report.every(result => result.passed) ? 0 : 1); return }
  const store = new DouchatStore(join(output, 'synthetic.db'))
  store.setCurrentAccountId('synthetic-timeout-qa')
  store.setUserName('测试用户')
  const computer: ComputerProvider = { snapshots: () => [], createTools: () => [], start: async () => { throw new Error('Disabled for QA') }, stop: async () => {}, show: async () => {}, dispose: () => {} }
  const runtime = new DouchatRuntime(store, computer, () => {})
  runtime.setInterfaceLanguage('zh-CN')
  runtime.configureCustomModels([provider])
  if (process.env.DOUCHAT_QA_LOCAL_AGENT) configureLocalAgentRegistry(sourceDirectory)
  trace((runtime as any).groupDecisionService)
  const agents = group.members.map(member => store.createAgent({ name: member.name, role: member.description,
    instructions: `${member.description}。只讨论本次任务，不调用任何外部工具。每次回复150字以内，直接提供具体内容。`,
    color: '#6366f1', ...(member.id === 'review' && process.env.DOUCHAT_QA_LOCAL_AGENT
      ? { provider: 'local', model: 'default', localAgentId: process.env.DOUCHAT_QA_LOCAL_AGENT }
      : { provider: `custom:${provider.id}`, model, thinkingLevel: 'low' as const }) }))
  for (const mode of (process.argv.includes('--leader-only') ? ['leader'] : ['leader', 'llm']) as ('leader' | 'llm')[]) {
    runtime.saveDecisionSettings({ mode, providerId: provider.id, model })
    const conversation = store.createGroup({ name: `隔离验收-${mode}`, agentIds: agents.map(agent => agent.id), leadAgentId: agents[0].id })
    const start = Date.now()
    const ticker = setInterval(() => {
      const workflow = store.groupWorkflows().find(value => value.conversationId === conversation.id)
      console.log(JSON.stringify({ scenario: mode, elapsedMs: Date.now() - start, status: workflow?.status,
        finishedCalls: Object.values(workflow?.calls ?? {}).filter(call => call.status === 'done').length }))
    }, 30_000)
    try { await runtime.sendMessage(conversation.id, content) } finally { clearInterval(ticker) }
    const workflow = store.groupWorkflows().find(value => value.conversationId === conversation.id)!
    const replies = store.topicMessages(conversation.id, conversation.activeTopicId).filter(message => message.kind === 'message' && message.authorId !== 'user')
    const speakers = [...new Set(replies.map(message => message.authorId))]
    const graph = (Object.values(workflow.calls).find(call => call.kind === 'decision' && call.status === 'done')?.value as GroupDecision | undefined)?.tasks
    const dependencyOrder = graph?.every(task => {
      const call = workflow.calls[`task:${task.id}:${task.memberId}`]
      return call?.status === 'done' && task.dependsOn.every(id => {
        const parent = graph.find(task => task.id === id)!
        const predecessor = workflow.calls[`task:${parent.id}:${parent.memberId}`]
        return predecessor?.status === 'done' && (predecessor.finishedAt ?? Infinity) <= (call.startedAt ?? 0)
      })
    })
    const passed = workflow?.status === 'completed' && agents.every(agent => speakers.includes(agent.id))
      && (process.argv.includes('--dag') ? dependencyOrder : replies.findIndex(message => message.authorId === agents[1].id) < replies.findIndex(message => message.authorId === agents[2].id))
      && replies.at(-1)?.authorId === agents[0].id
      && (!process.argv.includes('--dag') || Object.keys(workflow.calls).filter(key => key.startsWith('task:')).length >= 5)
    record({ scenario: `complex-${mode}`, passed, elapsedMs: Date.now() - start, status: workflow?.status,
      replies: replies.length, speakers: speakers.length, dependencyOrder, taskCalls: Object.keys(workflow.calls).filter(key => key.startsWith('task:')).length, events: store.runEvents.filter(event => event.runId === workflow?.runId && event.type === 'status') })
    writeFileSync(join(output, `${mode}.json`), JSON.stringify({ workflow, messages: store.topicMessages(conversation.id, conversation.activeTopicId) }, null, 2))
  }
  store.close()
  console.log(`REPORT ${output}`)
  app.exit(report.every(result => result.passed) ? 0 : 1)
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Live QA failed'); app.exit(1) })

import type { InterfaceLanguage } from './language'

/** Only application-authored copy belongs here; never translate agent replies. */
export const groupTranslations: Record<string, string> = {
  'Scheduling: {member} is not configured to run. Skipping this round.': '调度通知：{member} 当前运行配置不可用，本轮已跳过。',
  'Scheduling: {member} did not complete this reply. Deciding what happens next.': '调度通知：{member} 本次回复未完成，正在安排后续处理。',
  'Scheduling: {member} could not answer the current request: {reason}. Deciding what happens next.': '调度通知：{member} 未能回答这条新消息，原因：{reason}。正在安排后续处理。',
  'The conversation context is too long': '对话上下文过长',
  'The model output limit was reached': '模型输出额度不足或已达到上限',
  'The model reply timed out': '等待模型回复超时',
  'The model service is rate limited': '模型服务触发限流',
  'The model could not authenticate': '模型服务认证失败',
  'The model returned no usable reply': '模型未返回有效回复',
  'Round complete: {count} replied; {absent} did not reply this round ({members}).': '本轮已结束：{count} 人已回复，{absent} 人本轮未回复（{members}）。',
  '{member}: {reason}. Trying another coordinator.': '{member}：{reason}，正在自动切换下一位协调成员。',
  'Planning response timed out': '等待规划响应超时',
  'The model returned an empty planning response': '模型未返回规划内容',
  'The model returned an invalid plan format': '模型返回的计划格式不符合要求',
  'The planning model could not authenticate': '规划模型身份验证失败',
  'The planning service is rate limited': '规划服务请求受限',
  'The planning request failed': '规划请求失败',
  'A dependency attachment could not be loaded. The task is paused.': '无法加载前置任务的附件，任务已暂停。',
  'A task returned no deliverable. Execution is paused to avoid repeating possible external actions.': '任务没有返回交付物，已暂停执行，以免重复可能已经完成的外部操作。',
  'A member returned an incomplete result after an execution error. Review the partial output before retrying; external actions will not be repeated automatically.': '成员执行出错并返回了部分结果，任务已暂停。请核对已有结果后重试，系统不会自动重复外部操作。',
  'The task graph is blocked by an incomplete dependency.': '前置任务未完成，后续任务已暂停。',
  'The replacement lacks a required task permission.': '替补成员缺少任务所需权限，任务已暂停。',
  'The no-reply decision requires review.': '无需回复的判断存在不确定性，正在进一步复核。',
  'The single worker selection requires review.': '执行成员的选择需要进一步复核。',
  'Scheduled routine started · {name}': '定时任务已开始 · {name}',
  'Manual routine started · {name}': '手动任务已开始 · {name}',
  "The model did not return valid decision JSON.": "模型未返回有效决策 JSON。",
  "Jev requires a System One compatible provider.": "Jev 需要 System One 兼容供应商。",
  "The provider did not return the System One decision format.": "供应商未返回 System One 决策格式。",
  "The decision service is temporarily unavailable. Using fallback coordination.": "决策服务暂不可用，正在使用备用调度。",
  "Invalid decision format.": "决策格式无效。",
  "Missing trigger message.": "缺少触发消息。",
  "The leader must review the candidate roster.": "候选成员需要 Leader 进一步筛选。",
  "The leader must review recovery.": "故障处理需要 Leader 复核。",
  "The leader must review the coordinator selection.": "负责人选择需要 Leader 复核。",
  "The leader must review a task continuation.": "任务后续安排需要 Leader 复核。",
  "Member selection is uncertain.": "成员选择不确定。",
  "The model returned no usable decision content.": "决策模型没有返回有效内容。",
  "The model returned no usable decision content (output limit reached).": "决策模型没有返回有效内容（输出预算耗尽）。",
  "The model returned no usable decision content (upstream reasoning failed).": "决策模型没有返回有效内容（上游推理失败）。",

  "This coordinator produced no planning output for {seconds} seconds.": "该协调成员连续 {seconds} 秒没有产生规划输出。",
  "Group decision service": "群决策服务",
  "Choose who decides whether group messages need a reply and which members handle them. Members still use their own models to do the work.": "选择谁来判断群消息是否需要回复、由哪些成员处理。成员仍使用各自的模型完成任务。",
  "Decision mode": "决策方式",
  "Default": "默认",
  "Decision model": "决策模型",
  "A group coordinator decides whether to reply, who handles the task, and in what order. No separate decision model is required.": "由群内的协调成员判断是否需要回复、由谁处理及处理顺序，无需单独配置决策模型。",
  "Member health check interval (seconds)": "群成员健康探测周期（秒）",
  "Each group caches member availability and response time. New tasks refresh checks when the interval expires. Unavailable members receive no tasks until a successful check; unknown members may be rechecked after 30 seconds. Decisions consider health, skills, and response time.": "每个群分别缓存成员响应状态与速度；收到新任务时按检测周期刷新。不可用成员暂停分配任务，检测成功后恢复；仅状态未知的成员最早 30 秒后复查。决策时会参考健康状态、任务能力和响应速度。",
  "Douchat cloud decisions use credits. Each successful call costs {credits} credits.": "将使用 Douchat 云端决策模型进行调度，会消耗额度；每次成功调用消耗 {credits} credits。",
  "Save decision settings": "保存决策设置",
  "Group decision settings saved. They apply to the next task.": "群决策设置已保存，下个任务生效。",
  "Scheduling: {member} is unavailable. Skipping this round until the next health check.": "调度通知：{member} 暂不可用，本轮不再调用，等待下次健康检测。",
  "Scheduling: {member} is unavailable. Deciding what happens next.": "调度通知：{member} 暂不可用，正在决定后续安排。",
  "{leader}: skipped the unavailable member.": "{leader} 调度通知：已跳过该成员。",
  "{leader}: @{member} will take over the unfinished task.": "{leader} 调度通知：由 @{member} 接替未完成的任务。",
  "{leader}: task paused for human review.": "{leader} 调度通知：暂停任务，等待人工确认。",
  "{leader} assigned tasks: {members} (independent work).": "{leader} 分配任务：{members}（独立处理）。",
  "{leader} assigned tasks: {members} (in order).": "{leader} 分配任务：{members}（按顺序处理）。",
  "Round complete: {count} replied.": "本轮已结束：{count} 人已回复。",
  "Round complete: {count} replied; {absent} unavailable and skipped ({members}).": "本轮已结束：{count} 人已回复，{absent} 人不可用，已跳过（{members}）。",
  "No group coordinator is available.": "没有可用的群协调成员。",
  "This coordinator did not return a plan within {seconds} seconds.": "该协调成员未在 {seconds} 秒内返回计划。",
  "All {count} planning candidates failed. Last error: {error}": "已尝试全部 {count} 位规划候选，均未能制定计划。最后的错误：{error}",
  "{member} could not finish planning. Trying the next available member.": "{member} 未能完成规划，正在自动切换下一位可用成员。",
  "Group planning exceeded {seconds} seconds and was paused. Retry later or change the decision model.": "群任务规划超过 {seconds} 秒，已暂停。请稍后重试或更换决策模型。",
  "The previous attempt was interrupted at this step and may have performed external actions. Check the results and send a new explicit instruction. This step will not be repeated automatically.": "上次执行在此步骤中断，可能已产生外部操作。请核对结果后发送新的明确指令，系统不会自动重做。",
  "{member} was interrupted. Reason: {reason}\nExternal actions may have already run. Check the results before sending a new instruction; this task will not be repeated automatically.": "{member} 执行中断。原因：{reason}\n可能已有外部操作执行，请核对结果后再发送新的指令；系统不会自动重复执行此任务。",
  "A local agent was interrupted and may have performed external actions. Check the results and send a new explicit instruction.": "本地 Agent 执行中断，可能已产生外部操作。请核对结果后发送新的明确指令。",
  "{member} did not ask a clarification question. The task is paused. Clarify the scope to continue.": "{member} 未提出需要真人回答的澄清问题，任务已暂停。请明确补充任务范围后继续。",
  "{member} did not provide the required public contribution. The task is paused. Ask them to publish it before continuing.": "{member} 未提交所需的公开交付物，群任务已暂停。请要求该成员公开补充结果后继续。",
  "The private message format is invalid, but tools may have already run. Check the results and send a new explicit instruction. Actions will not be repeated automatically.": "回复的私信格式无效，但工具可能已经执行。请核对结果后发送新的明确指令，系统不会自动重复执行。",
  "Group task failed.": "群任务执行失败。",
  "The activity reached its execution limit. Review the results and send a new instruction.": "达到活动执行预算，请检查已有结果后发送新的指令。",
  "The group task with attachments was interrupted. Completed steps are preserved. Reattach the required files and send a new explicit instruction.": "上次含附件的群任务中断。已完成步骤保留；请重新附上必要材料并发送新的明确指令。",
  "The group task was interrupted. Completed steps are preserved. Review possible external actions and send a new explicit instruction.": "上次群任务中断。已完成步骤保留；请核对可能产生的外部操作后发送新的明确指令。",
  "The decision requires a pause: no member can safely take over.": "决策要求暂停：没有可安全接替的成员。",
  "The decision selected an unavailable replacement.": "决策选择了不可用的替补。",
  "Health check interval must be between 30 and 3600 seconds.": "健康探测周期必须为 30–3600 秒。",
  "Invalid group decision settings.": "群决策配置无效。",
  "Select a decision provider and enter a model ID.": "请选择决策模型供应商并填写模型 ID。",
  "The model returned invalid JSON.": "模型返回的 JSON 格式无效。",
  "The decision provider no longer exists. Add it in model settings.": "决策供应商不存在，请先在模型设置中添加。",
  "The decision provider does not exist.": "决策供应商不存在。",
  "Decision connection failed.": "决策连接失败。",
  "Decision service connected.": "决策服务连接成功。",
  "A successful connection test is billed as one decision call.": "测试成功会按一次决策调用消耗额度。",
  "Switched to default decision mode and saved.": "已自动切换为默认决策方式并保存。",
  "Default mode is selected but could not be saved. Save it again.": "已选择默认决策方式，但保存失败，请重新保存。",
  "The decision provider was removed.": "决策供应商已移除。"
}

export type GroupNotice = { key: string; values: Record<string, string | number> }
export function interpolate(text: string, values: Record<string, string | number>): string {
  // One pass: a member named "{count}" must not become a second template.
  return text.replace(/\{([^{}]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match)
}
export function groupText(language: InterfaceLanguage, key: string, values: Record<string, string | number> = {}): string {
  return interpolate(language === 'zh-CN' ? groupTranslations[key] ?? key : key, values)
}
export function groupNotice(language: InterfaceLanguage, key: string, values: Record<string, string | number> = {}) {
  return { text: groupText(language, key, values), localization: { key, values } }
}

const schedulingNoticeKeys = [
  'Scheduled routine started · {name}',
  'Manual routine started · {name}',
  'Scheduling: {member} is unavailable. Skipping this round until the next health check.',
  'Scheduling: {member} is unavailable. Deciding what happens next.',
  '{leader}: skipped the unavailable member.',
  '{leader}: @{member} will take over the unfinished task.',
  '{leader}: task paused for human review.',
  '{leader} assigned tasks: {members} (independent work).',
  '{leader} assigned tasks: {members} (in order).',
  'Round complete: {count} replied.',
  'Round complete: {count} replied; {absent} unavailable and skipped ({members}).'
]
const legacyNoticeTemplates = [
  ...schedulingNoticeKeys.flatMap(key => [key, groupTranslations[key]].map(template => ({ key, template }))),
  { key: '{leader}: skipped the unavailable member.', template: '{leader} 调度通知：跳过该成员，其他成员继续。' },
  { key: '{leader}: skipped the unavailable member.', template: '{leader} 调度通知：已跳过该成员，其他成员继续。' }
].map(({ key, template }) => {
  const names: string[] = []
  const escaped = template.split(/(\{[^{}]+\})/g).map(part => {
    const placeholder = /^\{([^{}]+)\}$/.exec(part)
    if (placeholder) { names.push(placeholder[1]); return ['count', 'absent'].includes(placeholder[1]) ? '(\\d+)' : '(.+?)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return { key, names, pattern: new RegExp(`^${escaped}$`, 'u') }
})

/** Read-time compatibility only. Never rewrite stored messages or model output. */
export function legacyGroupNotice(message: { kind: string; authorId: string; authorName: string; text: string }): GroupNotice | undefined {
  if (message.kind !== 'system' || message.authorId !== 'system' || message.authorName !== 'Douchat') return
  for (const { key, names, pattern } of legacyNoticeTemplates) {
    const match = pattern.exec(message.text)
    if (match) return { key, values: Object.fromEntries(names.map((name, index) => [name, match[index + 1]])) }
  }
}

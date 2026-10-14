# 群任务规划的进度与超时

本次修复针对模型请求和规划生命周期，适用于不同成员、项目和团队规模，不增加协作模式或固定角色。

若规划已很快结束，但成员在长对话后返回空回复或输出上限错误，参见后续补充的
[上下文预算与成本说明](model-context-budget.md)。这条路径与规划超时分别验证。

## 原因与处理

- 原自定义模型规划请求不使用流式输出，单次 60 秒的绝对期限无法区分正在生成和卡住。配置独立决策模型时还存在另一层 40 秒期限。现在统一接收 OpenAI / Anthropic 流式文本与推理活动，用 60 秒无有效进度期限判断停滞，并保留每轮 180 秒总预算。
- 网络保活、角色、usage 等空事件不能延长期限；用户取消立即终止，迟到的计划不能触发重复派工。推理正文不进入返回结果或诊断日志。JSON 响应仍兼容，但没有可观测进度时仍受无进度期限约束。
- 身份验证、限流、连接中断、截断的流不再进入“修正 JSON”循环。同一决策中的成员候选若共用已失败的自定义服务和模型，不重复请求该后端；不同本地配置不合并。真正的结构错误最多修正一次。
- 默认成员协调直接生成完整分工计划，取消初始的个人发言分类前置调用。保留完成情况检查、明确的 Jev 发言分类回退、依赖图执行、持久化步骤以及人工确认。
- DeepSeek 的 OpenAI 接口规划请求显式设置低推理及 JSON 输出；不改成员正式工作时的模型或思考设置。JSON 模式不代替客户端对成员 ID、任务依赖、权限和输出结构的校验。其他服务不会收到 DeepSeek 专用参数。
- 本地/托管控制器将实际工作进度传给规划期限；本地连接、就绪、审批或空心跳不算生成进度。托管控制器没有正式工作 run ID 时也能报告进度。
- 新增 `Planning response started` 诊断记录首个有效模型进度耗时。现有 `Decision timing` 记录总规划耗时。流式协议包有 16 MB 有限接收上限；长推理的重复 SSE 元数据不能按短 JSON 正文的大小误判。

这不会让服务宕机、配额不足或任意复杂任务无限运行。带工具的工作步骤仍沿用原来的执行/权限/恢复机制，不因规划重试而自动重复具有副作用的任务。

## 验证

自动回归覆盖流式 UTF-8/CRLF 分包、保活、截断/输出上限、取消、活跃规划超过旧的 40/60 秒期限、180 秒总预算、后端去重、结构修正、跨成员依赖和已完成步骤重放。

```sh
npm run typecheck
npm run build
npm test -- --maxWorkers=4
```

Node 25 的实验性 `localStorage` 与现有 jsdom 用例冲突时，用 `NODE_OPTIONS=--no-experimental-webstorage npm test -- --maxWorkers=4`。这是测试运行环境配置，不修改客户端存储逻辑。

真实调用必须显式开启，读取开发客户端已有服务商配置，仅在内存中解密密钥；任务、提示词与产出使用隔离数据库，不修改已有聊天。测试会产生 API 费用。

```sh
npx esbuild scripts/group-timeout-scenarios.ts --bundle --platform=node --format=esm --packages=external --outfile=out/group-timeout-scenarios.mjs
DOUCHAT_LIVE_SCENARIOS=1 DOUCHAT_QA_PROVIDER=deepseek node_modules/.bin/electron out/group-timeout-scenarios.mjs --dag
```

`DOUCHAT_QA_MODEL` 可选择模型，`DOUCHAT_QA_USER_DATA` 可指定开发数据目录。`--leader-only` 仅测成员协调，默认还测独立决策模型；`--dag` 测五项任务的并行准备、修订、评审和汇总，并用持久化开始/结束时间核验每条依赖边。设置 `DOUCHAT_QA_LOCAL_AGENT=codex` 将评审成员改成本地 Codex，需已有登录及可用可执行文件。

2026-10-14，使用同一已配置 DeepSeek Flash 服务的本机抽样：未修改上游的五任务规划在 60 秒截止时失败；修复版五任务完整执行在成员协调/独立决策路径分别为 27.2 / 23.2 秒，两次都完成全部五个任务且依赖顺序校验通过。一次三阶段需求—评审—汇总为 15.8 秒；DeepSeek 加本地 Codex（沿用已登录默认模型）的混合三阶段任务为 54.0 秒，三名成员均实际交付并完成汇总。这些是小样本实测，非服务延迟承诺，也不代表所有模型和外部工具已经实测。

完整原始合成测试记录保留在本机 `out/group-scenarios/timeouts-*`，不提交测试数据库、密钥或用户会话。

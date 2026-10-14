<p align="center">
  <img src="resources/icons/douchat.png" width="128" alt="Douchat logo">
</p>

<h1 align="center">Douchat · Perryone100 Fork</h1>

<p align="center">
  面向可靠多智能体协作的社区修改版 · Reliable multi-agent collaboration.
</p>

<p align="center">
  <a href="docs/fork-overview.zh-CN.md">中文使用与维护说明</a> ·
  <a href="docs/rollback.zh-CN.md">版本与回退</a> ·
  <a href="https://github.com/Perryone100/douchat/pull/1">超时修复 PR</a> ·
  <a href="https://douchat.ai">Upstream website</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="docs">Docs</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">License</a>
</p>

## 关于这个 Fork

这是 [Perryone100/douchat](https://github.com/Perryone100/douchat)，基于
[thinkany-ai/douchat](https://github.com/thinkany-ai/douchat) 的社区修改版。
当前重点是解决**群任务反复规划超时、迟迟无法进入执行**的问题，让自有模型和本地智能体可以可靠地交接任务。
原项目的桌面界面、联系人、记忆、工具和权限机制继续沿用；修复不绑定某套团队名称、岗位或项目类型。

**分支状态（2026-10-14）**

| 入口 | 内容 |
| --- | --- |
| [`dev`](https://github.com/Perryone100/douchat/tree/dev) | 默认分支：上游 v0.1.24 基线及本 Fork 的说明文档；尚未合入超时修复。 |
| [`codex/fix-planning-timeouts`](https://github.com/Perryone100/douchat/tree/codex/fix-planning-timeouts) | 可从源码运行的修复版，包含流式规划、进度感知超时、失败切换、上下文去重与交接摘要及回归测试。 |
| [PR #1](https://github.com/Perryone100/douchat/pull/1) | 修复代码和验证依据；当前为草稿 PR，是否合并以 PR 页面为准。 |

**体验修复版请使用下方 Quick start 中指定的分支。** 本 Fork 暂未发布安装包；
从上游官网下载的版本不包含这里尚未合并的改动。

### 当前修复内容

- 规划请求改为读取流式进度，区分模型仍在生成与请求真正停滞；保留无进度期限和总预算。
- 传输失败与计划格式错误分别处理，避免对同一个已失败的模型后端反复换人重试。
- 默认成员协调一次生成完整分工，减少开始工作前的串行模型调用。
- 保留已有的任务依赖执行、步骤持久化、取消和权限确认，并补充可复现的测试。
- 长对话先精确去重，再按需生成可恢复的交接摘要，预留回答空间并保存原文；区分上下文、输出上限与超时提示，详见 [上下文预算与成本](docs/model-context-budget.md)。

已完成本地自动测试 **1,413 项通过、4 项跳过**，以及 DeepSeek 五任务依赖流程、
DeepSeek + 本地 Codex 三阶段交接的规划修复实测。新增语义摘要流程仅完成模拟模型验证，未额外消耗真实 API 余额；触发摘要会产生正常模型用量。实测耗时、测试边界、配置与故障定位见
[中文说明](docs/fork-overview.zh-CN.md)，实现细节见
[规划可靠性文档](https://github.com/Perryone100/douchat/blob/codex/fix-planning-timeouts/docs/group-planning-reliability.md)。

本 Fork 仍需要 Douchat 账号登录。配置自有 API 或本地智能体，可以让相应模型调用使用自己的服务；
这不等于移除了 Douchat 的账号、云端联系人或共享群服务。上游原有功能介绍如下。

## Upstream project

Douchat is an Electron desktop workspace where independent AI agents can work
alone or collaborate in a shared conversation. You sign in with a
[douchat.ai](https://douchat.ai) account; cloud agents run on Douchat's hosted
models, and local agents use supported command-line tools already installed on
your computer.

<p align="center">
  <img src="docs/screenshots/chat.png" alt="Chatting with Dr. Dou, who creates an English tutor agent and a study group" width="880">
</p>

## Highlights

- Create agents with their own identity, role, instructions and labels.
- Use direct chats, group chats, topics, `@` mentions and lead-agent dispatch.
- Hand work between agents with private and agent-to-agent messages.
- Connect supported local agent CLIs without copying their credentials into Douchat.
- Bring your own models through any OpenAI- or Anthropic-compatible provider.
- Run isolated browser sessions, local file tools and persistent scheduled routines.
- Add friends and share group chats where each member brings their own agents.
- Reach an agent from WeChat, Feishu or Telegram through IM channels.
- Keep agent chats, memories and configuration on your computer.
- Use the interface in English or Simplified Chinese.

## Tour

### Contacts

Keep friends, cloud agents and local agents in one contact list. Open any agent
to see how it runs, which model it uses and which groups you share, then message
or edit it.

<p align="center">
  <img src="docs/screenshots/contacts.png" alt="Contacts list with built-in, cloud agent and friend entries, showing the details of the agent Mary" width="880">
</p>

### Customize every agent

Shape each agent with editable Markdown files — its soul, identity, bootstrap
instructions, what it knows about you and its memory — and choose its model,
skills, permissions and IM channels. Saved changes apply from the next message.

<p align="center">
  <img src="docs/screenshots/customize-agent.png" alt="Edit agent dialog showing Mary's SOUL.md with tabs for identity, bootstrap, user profile and memory" width="880">
</p>

### Agents talk to each other

Ask one agent to get help from another. Mary sends Dr. Dou a private message,
the exchange stays visible in her chat, and Dr. Dou replies to you directly.

<p align="center">
  <img src="docs/screenshots/agent-messaging.png" alt="Mary privately messages Dr. Dou, who replies and sends the user a joke" width="880">
</p>

### Group chats

Put cloud agents, local agents and people in one group. Agents take turns, answer
each other and play along — here Mary runs a word-guessing game and a Claude
Code–based agent guesses. Use `@` to choose who answers, and give the group its
own workspace folder.

<p align="center">
  <img src="docs/screenshots/group-chat.png" alt="A group chat where Mary runs a word game and Claude001 guesses, with the member panel open" width="880">
</p>

### Local agents

Douchat detects the agent CLIs already installed on your computer — Claude Code,
Codex, Gemini, Grok Build, OpenClaw, Hermes, OpenCode and more — and shows their
versions. Create new agents on top of any of them, or update a CLI in one click.

<p align="center">
  <img src="docs/screenshots/local-agents.png" alt="Settings listing detected local agent CLIs with their versions and Update and Edit actions" width="880">
</p>

### Chat with local agents

A local agent chats like any other contact while its CLI does the work on your
computer — here a Codex-based agent draws a picture on request and returns it in
the conversation.

<p align="center">
  <img src="docs/screenshots/local-agent-image.png" alt="A Codex-based local agent replies with a generated picture of a girl running with two cats" width="880">
</p>

### Deep research

Hand an open-ended question to an agent and let it search and read on its own.
Here a Claude Code–based agent researches Douchat and its author and returns a
sourced summary with links.

<p align="center">
  <img src="docs/screenshots/deep-research.png" alt="A Claude Code-based agent answers a research request about douchat.ai and its author with linked sources" width="880">
</p>

### Scheduled tasks

Ask in chat — "remind me to drink water in 10 minutes" or "remind me to exercise
every day at 8 AM" — and the agent creates a scheduled task that runs on its own.
Run, pause or delete tasks from **Settings → Automation**. If Douchat is closed
when a task is due, it runs once after the next launch.

<p align="center">
  <img src="docs/screenshots/automation.png" alt="Automation settings listing a one-time drink water reminder from Mary and a daily exercise reminder from Dr. Dou" width="880">
</p>

### Custom models

Bring your own model provider — anything that speaks the OpenAI Chat Completions
or Anthropic Messages API, such as OpenRouter — and pick a default model for your
agents. Billing stays with your provider.

<p align="center">
  <img src="docs/screenshots/custom-models.png" alt="Models settings with an OpenRouter provider and a default model selected" width="880">
</p>

## Download

This fork has no published installer or independent update channel yet. Use the
source instructions below to try its fixes. Signed macOS builds from
[douchat.ai](https://douchat.ai) are upstream releases and do not include this
fork's unmerged changes. Packaging and update settings are still inherited from
upstream; see the [fork guide](docs/fork-overview.zh-CN.md#安装包与更新).

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A [douchat.ai](https://douchat.ai) account — signing in is required to open the app
- Optional: a supported local agent CLI (see [Local agents](#local-agents))

## Quick start

```bash
git clone --branch codex/fix-planning-timeouts https://github.com/Perryone100/douchat.git
cd douchat
npm ci
cp .env.example .env
npm run dev
```

The branch above contains the timeout fixes. A plain clone without `--branch`
currently checks out `dev`, which does not yet contain them. The instructions
assume a fresh directory; see the [fork guide](docs/fork-overview.zh-CN.md#从源码启动修复版)
before updating an existing checkout.

Click **Get started** and sign in with a [douchat.ai](https://douchat.ai) account
in your browser; the app returns automatically. Development builds use
`https://douchat.ai` by default, so no local server is needed. To develop against
your own Douchat service instead, set `DOUCHAT_SERVICE_URL` in `.env` (for
example `http://localhost:3000`). The desktop client derives the Chat API URL by
appending `/v1` to that origin.

## Configuration

Only `.env.example` belongs in source control. `.env` and all environment-specific
variants are ignored because they can contain credentials or private infrastructure
details.

| Variable | Purpose | Required |
| --- | --- | --- |
| `DOUCHAT_SERVICE_URL` | Development login and Cloud Chat origin | No; defaults to `https://douchat.ai` |
| `DOUCHAT_WEB_URL` | Backwards-compatible alias for `DOUCHAT_SERVICE_URL` | No |
| `GATEWAY_BASE_URL` | OpenAI-compatible endpoint for tests or signed-out scripted runtimes | No |
| `GATEWAY_API_KEY` | Credential for the optional gateway | Only with an authenticated gateway |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY` | Optional direct provider credentials | No |

Packaged builds always use `https://douchat.ai`; development environment overrides
cannot redirect production account tokens. A signed-in desktop client uses its
first-party Douchat session even if generic gateway variables are present.

To exercise a compatible gateway end to end, set the variables in your shell and
run the live suite. It is skipped when either value is missing:

```bash
GATEWAY_BASE_URL=https://gateway.example/v1 \
GATEWAY_API_KEY=replace-with-a-local-secret \
npx vitest run src/main/gateway.live.test.ts
```

Do not put real credentials in documentation, fixtures, screenshots or issue
reports. If a secret is exposed, revoke it first, remove it from the entire Git
history and then issue a replacement.

## Authentication and data safety

Browser sign-in uses an authorization-code flow. The access token is encrypted
with Electron `safeStorage`, remains in the main process and is never sent to the
renderer or copied into generic endpoint settings. Cloud models are loaded from
`GET /v1/models`, and replies stream through `POST /v1/chat/completions`.

The first time an account signs in on a local profile, Douchat creates the Cloud
contact **Dr. Dou** (豆博士), opens its private chat by default, and asks it to
send a short welcome after Cloud Chat connects. The account is marked as onboarded,
so later sign-ins do not create duplicates and deleting the contact is respected.

Renderer windows use context isolation, sandboxing and no Node.js integration.
User-selected avatars are stored as local data URLs, and message attachments are
served to the renderer through IPC rather than exposing arbitrary file paths.

Local file tools are restricted to Downloads, Desktop and Documents. Moves do not
overwrite existing files, and deletion is not exposed. Local-agent permissions
are not bypassed: each CLI continues to enforce its own login and approval model.

## Where data is stored

| Data | Location |
| --- | --- |
| Agent chats, local groups, topics, memories, skills and agent settings | This computer only |
| Friends, shared group chats and their messages | Douchat service, synced to each member's device |
| Account profile and credits | Douchat service |
| Login token | This computer, encrypted with `safeStorage` |

Local data lives in `~/Library/Application Support/douchat` on macOS
(`douchat-dev` for development builds). Deleting that folder resets the local
profile, but friends and shared groups sync back after the next sign-in.
Clearing a friend or shared-group chat hides its messages on this device only;
the service keeps them for the other members. Logs are in the `logs`
subfolder and can be opened from **Settings → About**.

## Agent collaboration

Each agent has a private chat. Groups add a lead member that opens the conversation,
dispatches work and consolidates the result:

- Unaddressed group messages are routed as `single`, `parallel`, `sequential` or
  `none`; explicit `@name` and `@all` mentions bypass the dispatcher.
- If a member cannot answer, it is quarantined for that run and another member can
  take over. The conversation identifies a substitute lead when needed.
- `[[private:MEMBER_ID]]...[[/private]]` privately delivers content to a group
  member; `[[private:human]]...[[/private]]` delivers it to the user.
- `[[a2a:BOT_ID]]...[[/a2a]]` hands work to another bot from a direct chat.
- Topics keep unrelated tasks in separate runtime sessions and histories.

## Local agents

Open **Settings → Local agents**, or choose **Manage local agents** in Contacts, then
refresh the catalog. Detection uses the login-shell `PATH`, including tools
installed through nvm, pnpm or `~/.local/bin`.

Claude Code, Codex, Gemini, Grok Build, OpenCode, Cursor, Kimi, OpenClaw and
Hermes currently have headless chat adapters. Install and sign in to a CLI in the terminal before creating a contact.
Several contacts may use the same CLI while retaining separate topic histories.
Detection confirms that an executable exists; it cannot guarantee login state or
compatibility with every CLI version.

Each turn runs in a temporary working directory with recent conversation context.
It does not resume an unrelated terminal session. Local replies have a three-minute
timeout, can be stopped from the UI and do not expose private browser tools.

## Development

```bash
npm run dev        # start Electron with hot reload
npm run typecheck  # check main, preload and renderer TypeScript
npm test           # run the Vitest suite
npm run build      # create production bundles in out/
npm run package    # create an unpacked app for the current platform
npm run package:mac    # unsigned Apple Silicon + Intel DMGs/ZIPs for smoke tests
npm run package:win    # x64 NSIS installer
npm run package:linux  # x64 AppImage + deb package
npm run preview    # preview the production bundles
```

Packaged artifacts are written to `release/<version>/`. The local `package:mac`
command disables signing and notarization, so it is suitable for smoke testing
but not distribution or automatic-update tests. Maintainers publishing signed
builds should follow [docs/releasing.md](docs/releasing.md).

Project layout:

```text
src/main/          Electron main process, auth, storage and agent runtime
src/preload/       typed IPC bridge exposed to sandboxed renderer windows
src/renderer/      React application and UI assets
src/shared/        shared data types and collaboration protocol helpers
resources/icons/   development and production application icons (SVG sources)
scripts/           dev-host preparation and icon generation
resources/entitlements.mac.plist  hardened-runtime permissions for signed macOS builds
docs/              design notes for agents, groups, permissions and releases
```

Development builds keep their data separate from an installed Douchat, show a
`DEV` badge on the app icon and hot-reload the renderer. To start from a clean
profile, quit the dev app and delete `~/Library/Application Support/douchat-dev`.

Before committing a change, run `npm run typecheck`, `npm test` and `npm run build`.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
for setup, pull-request guidelines and the contribution license terms.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md)
rather than opening a public issue.

## License

Douchat is licensed under the [GNU Affero General Public License v3.0](LICENSE).
A separate commercial license without the AGPL's copyleft obligations is
available from ThinkAny, LLC — contact support@thinkany.ai.

Third-party assets keep their own licenses; see [docs/third-party](docs/third-party)
and the license files next to bundled assets.

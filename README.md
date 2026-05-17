# SynthMind

多 LLM 代理桌面平台 — 在统一的桌面应用中切换和管理多种 AI 模型。

![Python](https://img.shields.io/badge/python-3.11+-blue) ![LangGraph](https://img.shields.io/badge/LangGraph-agent-orange) ![React](https://img.shields.io/badge/React-18-61DAFB) ![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131)

---

## 特性

| 特性 | 说明 |
|------|------|
| **LangGraph Agent** | 带工具调用的有状态 agent 图，支持多轮对话 |
| **Time Travel** | 基于 Checkpointer 的执行历史浏览、分支、时间旅行 |
| **IM Bot 集成** | 飞书 WebSocket 长连接机器人，支持卡片审批交互 |
| **Git 集成** | 状态查看、暂存、提交、分支管理、Diff 对比、Stash |
| **FIM 代码补全** | 编辑器中通过 DeepSeek FIM API 实现 AI 代码补全 |
| **文件编辑器** | 左侧文件树浏览 + 内联编辑 + 保存 |
| **Human-in-the-Loop** | 敏感工具调用需人工审批，支持逐条/全部审批 |
| **Tools 系统** | 文件操作、代码执行、Web 搜索、Python REPL、Todo、子代理 |
| **Skills 系统** | 动态加载 skill（SKILL.md），自动注入 system prompt |
| **跨会话记忆** | Agent 自主保存观察 → 关键词检索 → 下次会话自动注入 |
| **主题切换** | 暗色/亮色主题 + 字体选择（Inter/System/Serif/Monospace） |
| **Tracing** | LLM 调用 + 工具执行全链路追踪，支持按线程筛选 |
| **Tauri 桌面壳** | 可选打包为原生桌面应用 |

---

## 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    Tauri v2 桌面窗口                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                React + Vite 前端 (TypeScript)               │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────┐  ┌───────────────┐  ┌──────────┐ │  │
│  │  │ Chat     │  │Thread│  │ SettingsPanel  │  │ RightPanel│ │  │
│  │  │ Window   │  │ List │  │ Prov/Feishu/   │  │ Files/Git │ │  │
│  │  │ +审批卡片 │  │      │  │ Theme/Traces   │  │ Sandbox/  │ │  │
│  │  │ +Time    │  │      │  │                │  │ Agents/   │ │  │
│  │  │ Travel ⟳ │  │      │  │                │  │ Traces    │ │  │
│  │  └──────────┘  └──────┘  └───────────────┘  └──────────┘ │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         │ HTTP / SSE / CORS                    │
│  ┌──────────────────────▼───────────────────────────────────┐  │
│  │                 Python 后端 (FastAPI sidecar)              │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐ │  │
│  │  │  API 层  │  │  Agent 引擎  │  │  Services            │ │  │
│  │  │ /api/chat│  │              │  │                      │ │  │
│  │  │ /git/*   │  │ LangGraph    │  │ threads / hitl       │ │  │
│  │  │ /files   │  │ StateGraph   │  │ skills / todos       │ │  │
│  │  │ /tracing │  │ checkpointer │  │ memory / tracing     │ │  │
│  │  │ /agents  │  │ → sqlite    │  │ whitelist / balance   │ │  │
│  │  │ /threads │  │              │  │ feishu_config        │ │  │
│  │  │ /configs │  │ 3 nodes:     │  │ checkpointer (sqlite) │ │  │
│  │  │ /time-   │  │ agent →     │  │ provider_config       │ │  │
│  │  │  travel  │  │ approval →  │  └──────────────────────┘ │  │
│  │  └──────────┘  │ tools       │                            │  │
│  │                └──────────────┘                            │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │   Bot 层                                              │ │  │
│  │  │   bot/base.py (BotAdapter) ← bot/feishu.py (WS)     │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**开发模式：** 后端独立运行，前端热加载
**发布模式：** 后端 → PyInstaller 编译 → Tauri sidecar → 一个安装包

---

## 项目结构

```
synthmind/
├── backend/
│   ├── main.py               # FastAPI 入口
│   ├── build_backend.py      # PyInstaller 编译
│   ├── requirements.txt
│   ├── scripts/migrate.py    # JSON → checkpointer 迁移
│   ├── api/                  # FastAPI 路由层
│   │   ├── server.py         # App 初始化 + 路由注册 + Bot 生命周期
│   │   ├── chat.py           # POST /api/chat
│   │   ├── chat_stream.py    # POST /api/chat/stream (SSE)
│   │   ├── approve.py        # HITL 审批
│   │   ├── configs.py        # Provider + Feishu 配置 CRUD
│   │   ├── threads.py        # 会话历史 + checkpointer 桥接
│   │   ├── time_travel.py    # Checkpoint 浏览 + 分支
│   │   ├── git.py            # 17 个 Git 操作端点
│   │   ├── files.py          # 文件浏览/读写 + FIM 代码补全
│   │   ├── tracing.py        # LLM + Tool 追踪
│   │   ├── balance.py        # DeepSeek 余额查询
│   │   ├── agents_api.py     # 子代理管理
│   │   └── ...               # memory, models, sandbox, skills, todos, whitelist
│   ├── core/                 # Agent 核心
│   │   ├── agent.py          # LangGraph StateGraph: call_model → check_approval → execute_tools
│   │   ├── llm.py            # LLM Provider 工厂
│   │   ├── state.py          # Pydantic 模型 + AgentState
│   │   ├── memory.py         # 跨会话记忆 (关键词检索)
│   │   ├── providers/        # deepseek.py (含 streaming + reasoning_content)
│   │   └── tools/            # 工具集
│   │       ├── __init__.py   # TOOLS + SENSITIVE_TOOLS 注册
│   │       ├── file_ops.py   # ls/read/write/edit/grep/glob
│   │       ├── web_search.py # Tavily 搜索
│   │       ├── sandbox_tools.py  # execute_command / python_repl
│   │       ├── delegate_tool.py  # 子代理委托
│   │       └── ...
│   ├── services/             # 持久化 + 业务逻辑
│   │   ├── threads.py        # JSON 线程存储 (逐步废弃中)
│   │   ├── hitl.py           # 审批队列 (内存)
│   │   ├── checkpointer.py   # PersistentMemorySaver (MemorySaver + sqlite)
│   │   ├── tracing.py        # SynthMindTracer → traces.json
│   │   ├── whitelist.py      # 工具白名单
│   │   ├── feishu_config.py  # 飞书配置
│   │   ├── subagents.py      # 子代理管理器
│   │   └── ...
│   └── bot/                  # IM 机器人
│       ├── base.py           # BotAdapter 基类
│       └── feishu.py         # 飞书 WebSocket 机器人
├── frontend/
│   ├── index.html            # 含 FOUC 防止脚本
│   ├── package.json
│   ├── vite.config.ts        # Vite proxy → backend
│   └── src/
│       ├── App.tsx           # 主布局 + 侧栏宽度记忆 + 右侧面板
│       ├── App.css           # 全局暗色/亮色主题 CSS 变量 + 所有组件样式
│       ├── ThemeContext.tsx   # 主题/字体 Context (localStorage + prefers-color-scheme)
│       ├── lib/api.ts        # 所有 API 客户端
│       └── components/
│           ├── ChatWindow.tsx        # 对话 + 审批卡片 + Time Travel 入口
│           ├── TimeTravelPanel.tsx   # Checkpoint 时间线 + 分支
│           ├── FilesPanel.tsx        # 文件树 + 内联编辑器 + FIM 按钮
│           ├── DiffPreview.tsx       # 彩色 Diff 预览
│           ├── GitPanel.tsx          # Git 主控制器
│           ├── ChangesView.tsx       # 文件变更分组 + 提交
│           ├── BranchManager.tsx     # 分支管理 + 对比
│           ├── BranchSelector.tsx    # 模糊搜索分支
│           ├── LogView.tsx           # 提交日志 + ASCII 图
│           ├── GitConsole.tsx        # Git 命令输出
│           ├── SettingsPanel.tsx      # Providers/Feishu/Skills/Memory/Whitelist/Traces/Appearance
│           ├── ThreadListPanel.tsx   # 会话列表 + 新建 + 文件夹选择器
│           ├── ModelSelector.tsx     # 模型/Provider/reasoning_effort
│           ├── RightPanel.tsx        # 5 标签页: Files/Git/Sandbox/Agents/Traces
│           ├── TracesTab.tsx         # LLM + Tool 追踪查看器
│           ├── BalanceDisplay.tsx    # DeepSeek 余额
│           ├── AgentPanel.tsx        # 子代理管理
│           └── ...
```

---

## 快速开始

```bash
# 环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 DEEPSEEK_API_KEY

# 安装依赖
make backend-install    # pip install
make frontend-install   # npm install
make dev-sidecar        # 首次：创建 dev sidecar 占位符

# 启动（两个终端）
make backend   # 终端 1: FastAPI → http://127.0.0.1:8000
make frontend  # 终端 2: Vite → http://localhost:5173

# 桌面模式
make tauri-dev  # Tauri 窗口 (仍需 make backend 运行后端)
```

---

## Agent 循环

基于 **LangGraph StateGraph**，三个节点构成循环：

```
用户消息 → call_model (LLM + tools)
                │
          有工具调用？──否──→ 返回回复
                │ 是
          敏感工具？──否──→ execute_tools
                │ 是
          check_approval ──→ 等待用户审批 → execute_tools
                                        ↓
                                call_model (继续)
```

- `call_model`: 组装 system prompt（skills 指令 + 记忆上下文 + todo 规划）→ 调用 LLM
- `check_approval`: 敏感工具需人工审批，非敏感或白名单内直接执行
- `execute_tools`: 并行执行工具，直接记录 trace（绕过 LangGraph callback 限制）

---

## Time Travel

基于 LangGraph Checkpointer 的执行历史管理。

- 每个 agent 节点执行后自动保存完整 `AgentState` 快照
- 使用 `PersistentMemorySaver`（MemorySaver + sqlite3 持久化），重启不丢失
- 在聊天窗口点击 ⟳ 按钮打开时间线，浏览每一步的 checkpoint
- 支持从任意历史节点 **Branch**（分支）：创建新线程，保留该点的消息上下文

```
Agent 执行 → Checkpoint (sqlite) → TimeTravelPanel 浏览
                                  → Branch → 新线程
```

---

## FIM 代码补全

在文件编辑器中通过 DeepSeek FIM（Fill-in-the-Middle）API 实现 AI 代码补全。

- 后端 `POST /api/files/fim-complete`：按光标位置分割代码为 prompt + suffix
- 前端快捷键：**Ctrl+Space** 或点击 **⟡ FIM** 按钮
- 补全内容自动插入光标位置，光标移到补全末尾

---

## Git 集成

右侧面板 Changes（⎇）标签页提供完整的 Git 功能：

- **Changes**: 文件按 Staged / Modified / Untracked / Conflicted 分组，支持 Stage / Unstage / Discard
- **Diff**: 彩色行级 Diff（新增绿色、删除红色、Hunk 蓝色）
- **Commit**: 提交表单
- **Log**: 提交历史 + ASCII 图
- **Branches**: 分支列表、切换、创建、合并、对比（ahead/behind 统计）
- **BranchSelector**: 模糊搜索下拉选择
- **Actions**: Pull / Push / Fetch / Stash
- **Console**: 可折叠的 Git 命令输出日志

---

## 主题切换

Settings → Appearance，支持：

- **暗色/亮色主题**: 所有 CSS 变量切换，保持品牌紫色不变
- **字体**: Inter / System Default / Serif / Monospace
- **快捷切换**: Settings header 中的 ☀️/🌙 按钮
- **自动检测**: 首次加载根据 `prefers-color-scheme` 自动选择
- **持久化**: 保存到 localStorage，FOUC 通过 `<head>` 内联 script 防止

---

## 飞书 Bot

通过 WebSocket 长连接接入飞书机器人，无需公网 URL。

- 设置 `BOT_MODE=feishu` 启用
- 支持文本消息和审批卡片交互（✅ Approve / ✕ Reject / 🔒 Whitelist）
- `/new` 命令创建新会话
- 线程 ID 隔离：`bot_feishu_{user_id}`
- 配置在 Settings → Feishu 中管理，保存到 `.config/feishu_config.json`

---

## 跨会话记忆

Agent 在对话中自主调用 `save_observation` 保存知识，下次对话自动注入。

```
用户消息 → 关键词检索记忆 → 注入 system prompt → LLM 调用
```

- 类型：user / feedback / project / reference
- 关键词评分检索，按优先级加权
- 前端 MemoryPanel 支持查看/添加/删除

---

## Tools 一览

| 工具 | 说明 | 敏感 |
|------|------|------|
| `get_current_time` | 当前时间 | 否 |
| `ls` / `read_file` / `write_file` / `edit_file` | 文件操作 | 是 |
| `grep` / `glob` | 文件搜索 | 是 |
| `web_search` | 网络搜索 | 是 |
| `save_observation` | 保存跨会话记忆 | 否 |
| `recall_memories` | 搜索历史记忆 | 否 |
| `write_todos` / `read_todos` / `update_task` / `delete_task` | 待办管理 | 否 |
| `execute_command` / `python_repl` | 沙箱执行 | 否 |
| `delegate` | 委托子代理 | 否 |

敏感工具可通过审批时选择 "Whitelist" 永久跳过审批。

---

## API 端点一览

| 路径 | 用途 |
|------|------|
| `POST /api/chat` | 发送消息（阻塞） |
| `POST /api/chat/stream` | 发送消息（SSE 流式） |
| `POST /api/approve` / `POST /api/approve-all` | 审批 |
| `GET /api/configs` / CRUD | Provider 配置 |
| `GET/PUT /api/feishu-config` | 飞书配置 |
| `GET /api/threads` / `GET /api/threads/{id}` | 线程列表/历史 |
| `POST /api/threads` | 创建线程 |
| `POST /api/threads/{id}/branch` | Time Travel 分支 |
| `GET /api/threads/{id}/checkpoints` | 浏览 checkpoint |
| `GET /api/threads/{id}/workdir` / `PUT .../workdir` | 工作目录 |
| `POST /api/pick-folder` | 原生文件夹选择器 |
| `GET/POST/DELETE /api/traces` | LLM/Tool 追踪 |
| `GET /api/balance` | DeepSeek 余额 |
| `GET /api/git/*` | 17 个 Git 操作 |
| `GET /api/files` / `GET /api/files/content` / `PUT /api/files/content` | 文件浏览/读写 |
| `POST /api/files/fim-complete` | FIM 代码补全 |
| `GET/POST/DELETE /api/agents` | 子代理 |
| `GET/POST/DELETE /api/whitelist` | 工具白名单 |
| `GET/POST/PUT/DELETE /api/todos` | 待办 |
| `GET/POST/DELETE /api/skills` | Skill 管理 |
| `GET /api/models` | 模型列表 |
| `POST /api/sandbox` | Sandbox 执行 |
| `GET/POST/DELETE /api/memory` | 跨会话记忆 |

---

## 打包发布

```bash
make build-all
```

PyInstaller 将后端编译为独立二进制，Tauri 将其嵌入为 sidecar，最终输出一个安装包。

---

## 添加新工具

在 `backend/core/tools/` 下创建文件，注册到 `__init__.py`：

```python
from langchain_core.tools import tool

@tool
def my_tool(param: str) -> str:
    """Tool description for the LLM."""
    return result
```

敏感工具需同时在 `SENSITIVE_TOOLS` 中注册。

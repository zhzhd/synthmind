# SynthMind

多 LLM 代理桌面平台 — 在统一的桌面应用中切换和管理多种 AI 模型。

![Python](https://img.shields.io/badge/python-3.11+-blue) ![LangGraph](https://img.shields.io/badge/LangGraph-agent-orange) ![React](https://img.shields.io/badge/React-18-61DAFB) ![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131)

---

## 特性

| 特性 | 说明 |
|------|------|
| **多 LLM 支持** | Anthropic / OpenAI / DeepSeek / Ollama，界面中一键切换 |
| **LangGraph Agent** | 带工具调用的有状态 agent 图，支持多轮对话 |
| **Human-in-the-Loop** | 敏感工具调用需人工审批，支持逐条/全部审批 |
| **Tools 系统** | 文件操作、代码执行、Web 搜索、Python REPL、Todo 管理 |
| **Skills 系统** | 动态加载 skill（SKILL.md），自动注入 system prompt |
| **Tasks** | Agent 托管的待办列表，支持增删改和多状态追踪 |
| **Sandbox** | 安全沙箱执行 shell 命令和 Python 代码 |
| **跨会话记忆** | Agent 自主保存观察 → 关键词检索 → 下次会话自动注入 |
| **Tauri 桌面壳** | 可选打包为原生桌面应用 |

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri v2 桌面窗口                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React + Vite 前端 (TypeScript)            │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌────────────────────┐  ┌───────────┐  │  │
│  │  │ ChatWindow│  │  ModelSelector     │  │ MemoryPanel│  │  │
│  │  │ 对话界面  │  │  模型/Provider切换  │  │ 记忆面板  │  │  │
│  │  ├──────────┤  ├────────────────────┤  ├───────────┤  │  │
│  │  │ TodoPanel│  │  SandboxPanel       │  │ Settings  │  │  │
│  │  │ 待办列表  │  │  沙箱执行          │  │ Provider  │  │  │
│  │  └──────────┘  └────────────────────┘  │ 配置面板  │  │  │
│  │                                        └───────────┘  │  │
│  └──────────────────┬────────────────────────────────────┘  │
│                     │ HTTP / WS                             │
│  ┌──────────────────▼────────────────────────────────────┐  │
│  │              Python 后端 (FastAPI sidecar)              │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │  API 层  │  │  Agent 引擎  │  │  Services        │  │  │
│  │  │          │  │              │  │                  │  │  │
│  │  │ /api/chat│  │ LangGraph    │  │ hitl (审批)      │  │  │
│  │  │ /memory  │  │ 图 + 工具   │  │ threads (会话)   │  │  │
│  │  │ /skills  │  │ 循环        │  │ skills (技能)    │  │  │
│  │  │ /sandbox │  │              │  │ todos (待办)     │  │  │
│  │  │ /todos   │  │              │  │ memory (记忆)    │  │  │
│  │  └──────────┘  └──────────────┘  └──────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**开发模式：** 后端独立运行，前端热加载
**发布模式：** 后端 → PyInstaller 编译 → Tauri sidecar → 一个安装包

---

## 项目结构

```
synthmind/
├── backend/
│   ├── main.py              # FastAPI 服务入口
│   ├── build_backend.py     # PyInstaller 编译脚本
│   ├── requirements.txt
│   ├── .env / .env.example
│   ├── api/                 # FastAPI 路由层
│   │   ├── server.py        # App 初始化，注册所有路由
│   │   ├── chat.py          # POST /api/chat
│   │   ├── approve.py       # HITL 审批
│   │   ├── configs.py       # Provider 配置管理
│   │   ├── memory.py        # 跨会话记忆 API
│   │   ├── models.py        # 可用模型发现
│   │   ├── sandbox.py       # 沙箱执行
│   │   ├── skills_api.py    # Skill 管理
│   │   ├── threads.py       # 会话历史
│   │   └── todos.py         # 待办列表
│   ├── core/                # Agent 核心
│   │   ├── agent.py         # LangGraph agent 图
│   │   ├── llm.py           # 多 LLM Provider 工厂
│   │   ├── state.py         # Pydantic 模型 & LangGraph 状态
│   │   ├── memory.py        # 跨会话记忆系统
│   │   ├── providers/       # Provider 适配器
│   │   │   ├── anthropic.py
│   │   │   ├── openai.py
│   │   │   ├── deepseek.py
│   │   │   └── ollama.py
│   │   └── tools/           # Agent 工具集
│   │       ├── __init__.py  # 注册所有工具
│   │       ├── calculator.py
│   │       ├── file_ops.py  # ls/read/write/edit/grep/glob
│   │       ├── memory_tools.py  # save_observation / recall_memories
│   │       ├── sandbox_tools.py # execute_command / python_repl
│   │       ├── time_tool.py
│   │       ├── todo_tools.py
│   │       └── web_search.py
│   ├── services/            # 业务逻辑
│   │   ├── hitl.py          # 审批状态管理
│   │   ├── provider_config.py  # Provider 配置持久化
│   │   ├── skills.py        # Skill 加载/管理
│   │   ├── threads.py       # 会话历史持久化 + 自动压缩
│   │   └── todos.py         # 待办持久化
│   └── .config/             # 运行时数据（自动创建）
│       ├── threads/         # 会话历史 JSON
│       ├── memory/          # 跨会话记忆 JSON
│       ├── skills_index.json
│       ├── todos.json
│       └── sandbox.json
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx          # 主布局 + 侧边栏
│   │   ├── App.css          # 全局暗色主题
│   │   ├── main.tsx
│   │   ├── lib/api.ts       # 后端 API 客户端
│   │   └── components/
│   │       ├── ChatWindow.tsx   # 对话界面 + 审批卡片
│   │       ├── ModelSelector.tsx
│   │       ├── AgentStatus.tsx
│   │       ├── SettingsPanel.tsx  # Provider 配置
│   │       ├── TodoPanel.tsx
│   │       ├── SandboxPanel.tsx
│   │       └── MemoryPanel.tsx   # 记忆面板
│   └── src-tauri/           # Tauri v2 桌面壳
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── binaries/        # 编译后的后端二进制
│       └── src/
│           ├── main.rs
│           └── lib.rs       # sidecar 生命周期管理
├── Makefile
└── README.md
```

---

## 前置要求

- **Python** ≥ 3.11
- **Node.js** ≥ 18
- **Rust 工具链**（仅打包需要）：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- 至少一个 **LLM API Key**（Anthropic / OpenAI / DeepSeek）

---

## 开发工作流

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入你的 API Key
```

### 2. 安装依赖

```bash
# 后端
cd backend && pip install -r requirements.txt --break-system-packages

# 前端
cd frontend && npm install
```

### 3. 创建 dev sidecar 占位符（仅首次）

```bash
make dev-sidecar
```

### 4. 启动（两个终端）

**终端 1 — 后端：**
```bash
make backend
```

**终端 2 — 前端：**
```bash
make frontend
```

浏览器打开 **http://localhost:5173** 即可使用。

> 前端通过 Vite proxy 自动把 `/api/*` 请求转发到后端。

### 5. 桌面模式（可选）

```bash
# 终端 1：后端
make backend

# 终端 2：桌面窗口
make tauri-dev
```

---

## 设计思路

### Agent 循环

Agent 基于 **LangGraph StateGraph**，三个节点构成循环：

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

- `call_model`: 组装 system prompt（含 skills 指令 + 记忆上下文 + todo 规划）→ 调用 LLM
- `check_approval`: 敏感工具（文件读写、搜索）需人工审批，非敏感直接执行
- `execute_tools`: 并行执行工具，结果作为 tool message 返回 agent

### 会话历史

`services/threads.py` 管理按 thread_id 隔离的会话 JSON。超过 40 条消息时自动压缩：将最早的消息摘要为一条 `[Earlier conversation summary: ...]`，保留最新的 40 条。

### Skills 系统

`.skills/` 目录下每个子目录包含一个 `SKILL.md`（YAML frontmatter + 指令正文）。激活的 skill 会在每个 system prompt 末尾自动注入，指导 agent 行为。

---

## 跨会话记忆系统

借鉴 Claude Code 的 Auto Memory 机制，让 agent 具备跨 session 的记忆能力。

### 运行机制

```
┌─────────────────────────────────────────┐
│              对话开始                     │
│                                         │
│  用户消息 → 关键词检索记忆 → 注入 context │
│                                         │
│  执行中...                               │
│   - 用户纠正 → save_observation(feedback)│
│   - 发现偏好 → save_observation(user)    │
│   - 关键决策 → save_observation(project) │
│                                         │
│  下次对话 → 相同关键词触发 → 自动注入     │
└─────────────────────────────────────────┘
```

### 核心设计

| 层次 | 说明 |
|------|------|
| **存储** | `.config/memory/`，每个记忆一个 JSON 文件 + `index.json` 索引 |
| **类型** | `user`（用户画像） / `feedback`（纠正） / `project`（决策） / `reference`（外部指针） |
| **检索** | 分词匹配 content + tags，优先级加权排序，取 Top 5 |
| **注入** | 每次 `call_model` 根据用户最后一条消息检索，追加到 system prompt |
| **上限** | 索引 200 条，超出时丢弃最低优先级最旧的记忆 |

### Agent 工具

Agent 在对话中自主调用：

- `save_observation(type, content, tags)` — 保存发现的观察
  - 用户纠正 → `type='feedback'`
  - 用户偏好/角色 → `type='user'`
  - 项目决策 → `type='project'`
- `recall_memories(query)` — 主动搜索历史记忆

### 前端面板

左侧边栏 MemoryPanel 展示所有记忆，支持：
- 按类型筛选（All / User / Feedback / Project / Reference）
- 手动添加记忆
- 删除无用记忆

### 检索评分

使用轻量关键词匹配（无需向量库/外部 API）：

```
score = (关键词匹配数 / 总词数) × (1 + (优先级-1) × 0.15)
```

---

## HITL 机制

Sensitive tools 在 `SENSITIVE_TOOLS` 字典中注册。当 agent 调用敏感工具时：

1. 后端创建 PendingApproval 记录
2. 前端展示审批卡片（工具名 + 参数 + 解释）
3. 用户可：Approve / Reject / Edit 参数
4. 结果（或拒绝消息）以 tool message 形式回传给 agent

支持 "Approve All" 批量审批。

---

## Sandbox 沙箱

Agent 可以通过 `execute_command` 和 `python_repl` 在受控环境中执行代码：

- `execute_command(cmd, timeout)` — 执行 shell 命令，带超时、工作目录隔离
- `python_repl(code, timeout)` — 执行 Python 代码片段

结果实时显示在前端 SandboxPanel，支持查看执行历史。

---

## Tools 一览

| 工具 | 说明 | 敏感 |
|------|------|------|
| `calculator` | 数学计算 | 否 |
| `get_current_time` | 当前时间 | 否 |
| `ls` / `read_file` / `write_file` / `edit_file` | 文件操作 | 是 |
| `grep` / `glob` | 文件搜索 | 是 |
| `web_search` | 网络搜索 | 是 |
| `save_observation` | 保存跨会话记忆 | 否 |
| `recall_memories` | 搜索历史记忆 | 否 |
| `write_todos` / `read_todos` / `update_task` / `delete_task` | 待办管理 | 否 |
| `execute_command` / `python_repl` | 沙箱执行 | 否 |

---

## 支持的 LLM

| Provider | 配置方式 | 示例模型 |
|----------|---------|---------|
| **Anthropic** | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o |
| **DeepSeek** | `DEEPSEEK_API_KEY` | deepseek-chat, deepseek-reasoner |
| **Ollama** (本地) | `ollama serve` | llama3.2, qwen2.5 |

也可以在 Settings 面板中通过表单管理 Provider 配置，支持多组配置保存和连接测试。

---

## 打包发布

```bash
make build-all
```

详见 [Makefile](Makefile) 中的构建流程。PyInstaller 将后端编译为独立二进制，Tauri 将其嵌入为 sidecar，最终输出一个安装包。

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

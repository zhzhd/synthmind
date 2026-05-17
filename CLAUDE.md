# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Backend
make backend              # Start FastAPI dev server on http://127.0.0.1:8000
make backend-install      # pip install -r requirements.txt
make backend-build        # PyInstaller compile

# Frontend (Vite + React)
make frontend             # Start Vite dev server on http://localhost:5173 (proxies /api → 8000)
make frontend-install     # npm install

# Desktop (Tauri)
make tauri-dev            # Run Tauri desktop window (needs make backend running)
make tauri-build          # Build Tauri installer

# Full distributable build
make build-all            # PyInstaller backend → Tauri final bundle

# Clean
make clean                # Remove __pycache__, dist, node_modules
make kill-ports           # Kill processes on 8000 and 5173
```

- No test framework is configured — there are no tests to run.
- No linter/formatter config is present.
- Backend uses `python-dotenv`; create `backend/.env` from `backend/.env.example`.

## Project Architecture

### Overview

SynthMind is an LLM agent platform with a React frontend, FastAPI backend, and optional Tauri desktop shell. The agent engine uses LangGraph StateGraph with a 3-node cycle: `call_model` → `check_approval` → `execute_tools`.

### Backend (`backend/`)

```
backend/
├── main.py                 # Entry point — loads .env, starts uvicorn
├── api/server.py           # FastAPI app factory, lifespan (bot startup), CORS, all router registrations
├── api/                    # Route modules (chat*, approve, configs, git, threads, tracing, etc.)
├── core/                   # Agent engine
│   ├── agent.py            # LangGraph StateGraph: call_model → check_approval → execute_tools
│   │                       #   run_agent() returns (content, thread_id, pending, reasoning_content)
│   ├── llm.py              # Provider factory — get_chat_model(provider, model, api_key, base_url)
│   ├── state.py            # Pydantic schemas (ModelConfig, ChatRequest, AgentState, etc.)
│   ├── memory.py           # Cross-session memory: keyword-based retrieval, auto-inject into system prompt
│   ├── providers/          # LLM adapter stubs (deepseek.py has streaming + reasoning_content)
│   └── tools/              # Tool registry (__init__.py exports TOOLS, SENSITIVE_TOOLS)
│       ├── file_ops.py     # ls, read_file, write_file, edit_file, grep, glob
│       ├── web_search.py   # Tavily-based web search
│       ├── sandbox_tools.py  # execute_command, python_repl
│       ├── todo_tools.py   # write_todos, read_todos, update_task, delete_task
│       ├── memory_tools.py # save_observation, recall_memories
│       ├── delegate_tool.py  # delegate to sub-agents
│       └── time_tool.py    # get_current_time
├── services/               # Business logic / persistence
│   ├── threads.py          # Thread history JSON, auto-compression at 40 messages
│   ├── hitl.py             # Pending approval queue (in-memory dict)
│   ├── whitelist.py        # Tool whitelist persistence (.config/whitelist.json)
│   ├── provider_config.py  # Provider configs (.config/provider_configs.json)
│   ├── skills.py           # SKILL.md loader from .skills/ directory
│   ├── subagents.py        # Sub-agent manager — AGENT.md files, isolated LangGraph instances
│   ├── tracing.py          # SynthMindTracer (BaseCallbackHandler) → .config/logs/traces.json
│   ├── todo*.py            # Todo persistence
│   ├── balance.py          # DeepSeek balance query
│   └── feishu_config.py    # Feishu bot config persistence
└── bot/                    # IM bot adapters
    ├── base.py             # BotAdapter base class (handle_message, handle_approval)
    └── feishu.py           # FeishuBot — lark-oapi WebSocket client, card approval UI
```

**Agent loop** (in `core/agent.py`):
1. `call_model` — Assembles system prompt (skills + memory + todo planning) → invokes LLM
2. If LLM returns tool_calls → `check_approval` — checks SENSITIVE_TOOLS + whitelist, creates pending if needed
3. `execute_tools` — Runs tools in parallel, records traces directly, results as ToolMessage
4. Re-enters `call_model` to let LLM process tool results, loop continues until no more tool_calls

**Key behaviors:**
- `run_agent()` returns 4-tuple normally, 3-tuple when pending (callers must handle both).
- Tool traces are recorded **directly** in `execute_tools()` / `resume_with_approval()` — NOT via LangChain callbacks (LangGraph strips callbacks between nodes).
- `llm.stream()` yields `AIMessageChunk` directly (not `ChatGenerationChunk`).
- Streaming endpoint (`chat_stream.py`) sends SSE events: `reasoning_content`, `content`, `tool_calls`, `done`.
- Threads auto-compress at >40 messages: oldest messages become one `[Earlier conversation summary: ...]`.

### Frontend (`frontend/`)

```
frontend/src/
├── App.tsx                 # Main layout — left sidebar, center chat, right panel
├── App.css                 # Global dark theme, all component styles
├── lib/api.ts              # All API calls + TypeScript interfaces
└── components/
    ├── ChatWindow.tsx       # Chat UI + approval cards + token badge
    ├── ThreadListPanel.tsx  # Left sidebar — thread list, new thread, folder picker
    ├── ModelSelector.tsx    # Provider/model/reasoning_effort dropdown
    ├── SettingsPanel.tsx    # Modal — Provider config, Feishu config, Traces tab
    ├── RightPanel.tsx       # 5-tab right panel (Files, Git, Sandbox, Agents, Traces)
    ├── FilesPanel.tsx       # File tree with git status badges (M/A/D/?)
    ├── GitPanel.tsx         # Main git controller — Changes/Log/Branches sub-views
    ├── ChangesView.tsx      # Staged/Modified/Untracked/Conflicted groups + commit form
    ├── DiffPreview.tsx      # Inline unified diff with +/- coloring
    ├── LogView.tsx          # Commit log with ASCII graph
    ├── BranchManager.tsx    # Branch list, switch, merge, create, compare
    ├── BranchSelector.tsx   # Fuzzy-search branch dropdown
    ├── GitConsole.tsx       # Collapsible git command output log
    ├── TracesTab.tsx        # LLM/tool trace viewer with filters
    ├── AgentPanel.tsx       # Sub-agent management
    ├── BalanceDisplay.tsx   # DeepSeek balance widget (5-min refresh)
    ├── SandboxPanel.tsx     # Shell/Python execution history
    ├── TodoPanel.tsx        # Todo list CRUD
    └── AgentStatus.tsx      # Thinking indicator
```

### Right Panel Layout

The `RightPanel` has 5 tabs accessible via tab buttons at the top:
- **📁 Files** — File tree with git status overlay (delegates to backend `GET /api/files`)
- **⎇ Changes** — Git changes, commit, branch management
- **🔧 Sandbox** — Command execution history
- **🤖 Agents** — Sub-agent definitions
- **📊 Traces** — LLM call and tool execution traces

### Settings Panel

Modal with these sections (tab bar at top):
- **Providers** — Add/edit/delete/test LLM provider configs. Only DeepSeek is listed by default.
- **Feishu** — Configure Feishu bot (App ID, App Secret, Bot Name)
- **Traces** — Same as the Right Panel Traces tab

### API Endpoints Overview

| Route | File | Purpose |
|-------|------|---------|
| POST `/api/chat` | `chat.py` | Send message (blocking) |
| POST `/api/chat/stream` | `chat_stream.py` | Send message (SSE streaming) |
| GET/POST `/api/threads` | `threads.py` | List threads, create thread, folder picker |
| GET/PUT/DELETE `/api/configs` | `configs.py` | Provider CRUD + test connection + Feishu config |
| POST `/api/approve` | `approve.py` | Approve/reject pending tool call |
| GET/POST `/api/traces` | `tracing.py` | List/clear traces (optional ?thread_id=) |
| GET/POST/DELETE `/api/agents` | `agents_api.py` | Sub-agent definitions |
| GET/POST `/api/skills` | `skills_api.py` | Skill management |
| GET/POST/PUT/DELETE `/api/todos` | `todos.py` | Todo CRUD |
| POST `/api/sandbox` | `sandbox.py` | Execute command |
| GET `/api/models` | `models.py` | Available models |
| GET `/api/balance` | `balance.py` | DeepSeek balance |
| GET `/api/files` | `files.py` | List directory / read file |
| GET/POST/PUT/DELETE `/api/git/*` | `git.py` | 17 git operations |
| GET/PUT `/api/feishu-config` | `configs.py` | Feishu bot settings |
| GET/POST/DELETE `/api/whitelist` | `whitelist.py` | Tool whitelist management |

### IM Bot Integration

- Set `BOT_MODE=feishu` env var to enable the Feishu bot (starts in FastAPI lifespan).
- `bot/base.py` BotAdapter handles: message routing, `/new` command, approval dispatching.
- `bot/feishu.py` uses lark-oapi v1.6.5 WebSocket mode (`WSClient` + `EventDispatcherHandler`).
- Thread IDs are namespaced as `bot_{platform}_{user_id}` so IM conversations are isolated.
- Feishu card buttons (approve/reject/whitelist/approve_all/reject_all) map to `handle_approval()`.
- SSL cert fix: uses `certifi` in a thread-isolated event loop (lark-oapi background thread issue).

### Provider Architecture

- `core/llm.py` has `get_chat_model()` factory that returns a LangChain chat model.
- Each provider in `core/providers/` wraps the SDK (langchain-anthropic, langchain-openai, etc.).
- DeepSeek is the default and has streaming support (`_stream()` in `deepseek.py` with `reasoning_content` extraction).
- `services/provider_config.py` persists multiple named configs to `.config/provider_configs.json`.
- Settings UI lets users add/manage configs; the list populates the ModelSelector.

### Sub-Agent System

- `services/subagents.py` — reads `AGENT.md` files from `.agents/` directory (YAML frontmatter + system prompt body).
- Each sub-agent runs an independent 2-node LangGraph (agent → tools loop) with its own tool set and model config.
- The `delegate` tool (in `core/tools/delegate_tool.py`) lets the main agent dispatch tasks to sub-agents.
- `api/agents_api.py` provides CRUD endpoints.

### Data Storage

All runtime data lives in `backend/.config/` (auto-created):
- `threads/` — Per-thread message JSON files
- `memory/` — Cross-session memory files + `index.json`
- `logs/traces.json` — LLM/tool traces
- `provider_configs.json`, `whitelist.json`, `feishu_config.json`, `skills_index.json`, `todos.json`, `sandbox.json`

## Key Design Notes

- **LangGraph strips callbacks** between graph nodes, so tool traces are recorded directly in `execute_tools()` via `_record_tool_trace()`, not through the callback handler.
- **`run_agent()` return value** can be 3 or 4 elements: check `len(result)` before unpacking.
- **Streaming** emits SSE events: `data: {"type":"reasoning_content","content":"..."}` followed by content and a final `done` event with token usage.
- **Thread auto-compression** kicks in at 40+ messages — oldest messages are summarized into a single entry.
- **Skills** are `.skills/*/SKILL.md` files with YAML frontmatter. Active skills inject instructions into every system prompt.

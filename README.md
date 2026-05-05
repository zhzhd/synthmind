# SynthMind

多 LLM 代理桌面平台 — 在统一的桌面应用中切换和管理多种 AI 模型。

![Python](https://img.shields.io/badge/python-3.11+-blue) ![LangGraph](https://img.shields.io/badge/LangGraph-agent-orange) ![React](https://img.shields.io/badge/React-18-61DAFB) ![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131)

---

## 架构

```
┌─────────────────────────────────────────────────┐
│           Tauri v2 桌面窗口                       │
│  ┌───────────────────────────────────────────┐  │
│  │        React + Vite 前端 (TypeScript)      │  │
│  │   - 聊天界面                                │  │
│  │   - 模型选择器                              │  │
│  │   - Agent 状态指示器                        │  │
│  └──────────────────┬────────────────────────┘  │
│  ┌──────────────────▼────────────────────────┐  │
│  │    Python 后端 (Sidecar 进程)               │  │
│  │    PyInstaller 编译为独立二进制              │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**开发模式：** 后端独立运行，前端热加载
**发布模式：** 后端 → PyInstaller 编译 → Tauri sidecar → 一个安装包

---

## 前置要求

- **Python** ≥ 3.11
- **Node.js** ≥ 18
- **Rust 工具链**（仅打包需要）：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- 至少一个 **LLM API Key**（Anthropic / OpenAI）

## 两种工作流概览

这个项目支持两种模式：

| | 开发模式（快速迭代） | 发布模式（单包分发） |
|--|---------------------|--------------------|
| 后端 | `python main.py` 直接运行 | PyInstaller 编译成独立二进制 |
| 前端 | Vite 热加载 | 编译成静态文件嵌入 Tauri |
| 桌面壳 | 不需要 | Tauri v2 打包为安装包 |
| 用户感知 | 开两个终端 | 双击一个图标 |

---

## 一、开发工作流

> 适合日常写代码、调试 agent、加工具。前后端分离、热加载，改完立见效果。

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

### 3. 创建开发用 sidecar 占位符（仅首次）

Tauri 构建时需要 sidecar 二进制存在。开发阶段还没编译后端，所以先创建一个无害的占位脚本：

```bash
make dev-sidecar
```

这会在 `frontend/src-tauri/binaries/` 下创建一个和你当前平台匹配的 shell 脚本。发布打包时 `make build-all` 会自动覆盖它为真正的编译产物。

### 4. 启动（两个终端）

**终端 1 — 后端（FastAPI 服务）：**
```bash
make backend
```
```
🟢 SynthMind backend starting on 127.0.0.1:8000
```

**终端 2 — 前端（Vite 开发服务器）：**
```bash
make frontend
```

浏览器打开 **http://localhost:5173** 即可使用。

> 前端通过 Vite proxy 自动把 `/api/*` 请求转发到后端，开发时无需跨域配置。

### 4. 迭代开发

| 改什么 | 怎么改 | 效果 |
|--------|--------|------|
| Agent 逻辑（tools / core / llm） | 改 `backend/agent/` 下的文件 | 后端自动 reload |
| 前端界面 | 改 `frontend/src/` 下的文件 | 浏览器热更新 |
| 环境变量 | 改 `backend/.env` | 重启后端即可 |

### 6. Tauri 桌面模式（可选）

如果你装了 Rust 工具链，也可以直接启动桌面窗口：

```bash
# 终端 1：启动后端（必须）
make backend

# 终端 2：启动桌面窗口
make tauri-dev
```

注意 Tauri 桌面模式下后端仍需单独启动。`make tauri-dev` 会自动执行 `dev-sidecar` 确保占位符已创建。

---

## 二、打包工作流

> 适合准备发布。把整个应用打成一个安装包，用户双击就能用，感觉不到后端的独立存在。

### 原理

```
PyInstaller ──编译──→ backend.exe (独立二进制，~30MB)
                            │
                            ↓ 放入 src-tauri/binaries/
Tauri build ──打包──→ SynthMind Setup.exe / SynthMind.dmg / SynthMind.deb
                     ├── 前端 (内嵌在 Rust 二进制)
                     └── backend.exe (注册为 sidecar)
```

应用启动时，Tauri 自动拉起 `backend.exe`，关闭时自动杀掉。用户看到的只是一个桌面应用。

### 首次准备

```bash
# PyInstaller（只需装一次）
pip install pyinstaller --break-system-packages

# Rust 工具链（如果还没装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 一键打包

```bash
make build-all
```

这条命令完成以下三步：

| 步骤 | 命令 | 产出 |
|------|------|------|
| 1 | `python build_backend.py` | 后端 → `src-tauri/binaries/synthmind-backend-{target}.exe` |
| 2 | `npm run build` | 前端 → `frontend/dist/` |
| 3 | `npm run tauri build` | 全部打包 → 安装包 |

### 打包产物位置

| 平台 | 安装包 |
|------|--------|
| **Windows** | `frontend/src-tauri/target/release/bundle/msi/SynthMind_0.1.0_x64_en-US.msi` |
| **Linux** | `.../deb/synthmind_0.1.0_amd64.deb` 或 `.../appimage/synthmind_0.1.0_amd64.AppImage` |
| **macOS** | `.../dmg/SynthMind_0.1.0_x64.dmg` |

### 分步调试

```bash
# 只编译后端（验证 PyInstaller 是否成功）
make backend-build

# 只打 Tauri 包（前提：后端已编译，二进制在 binaries/ 目录下）
cd frontend && npm run tauri build
```

### 打包注意事项

| 场景 | 说明 |
|------|------|
| **Windows** | PyInstaller 需要在 Windows 上跑，不支持交叉编译 |
| **macOS** | 需要在 macOS 上打包才能签名 |
| **Linux** | 需要在 Linux 上打包，目标架构需一致 |
| **API Key** | 用户需要自己创建 `backend/.env` 填入 key（sidecar 启动时会加载） |

---

## 支持的 LLM

| Provider | 配置方式 | 示例模型 |
|----------|---------|---------|
| **Anthropic** | 设置 `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| **OpenAI** | 设置 `OPENAI_API_KEY` | gpt-4o |
| **DeepSeek** | 设置 `DEEPSEEK_API_KEY` | deepseek-chat, deepseek-reasoner |
| **Ollama** (本地) | 运行 `ollama serve` | llama3.2, qwen2.5 |

在 `.env` 中配置 API Key，启动后在界面左侧切换 Provider 和模型。

---

## 项目结构

```
synthmind/
├── backend/
│   ├── main.py              # FastAPI 服务入口
│   ├── build_backend.py     # PyInstaller 编译脚本 ← NEW
│   ├── requirements.txt
│   ├── .env / .env.example
│   ├── pyproject.toml
│   └── agent/
│       ├── __init__.py
│       ├── core.py           # LangGraph agent 图
│       ├── llm.py            # 多 LLM Provider 工厂
│       ├── tools.py          # 工具定义
│       └── schemas.py        # Pydantic 模型
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx           # 主布局
│   │   ├── App.css           # 全局样式（暗色主题）
│   │   ├── main.tsx
│   │   ├── lib/api.ts        # 后端 API 客户端（自动切换 dev/prod）
│   │   └── components/
│   │       ├── ChatWindow.tsx
│   │       ├── ModelSelector.tsx
│   │       └── AgentStatus.tsx
│   └── src-tauri/            # Tauri v2 桌面壳
│       ├── Cargo.toml
│       ├── tauri.conf.json   # 含 externalBin 配置
│       ├── binaries/         # ← 编译后的后端二进制放这里
│       ├── capabilities/
│       │   └── default.json  # 含 shell:spawn 权限
│       └── src/
│           ├── main.rs
│           └── lib.rs        # setup 中自动启动 sidecar
├── Makefile
└── README.md
```

---

## 添加新工具

在 `backend/agent/tools.py` 中创建一个 `@tool` 函数，然后加到 `TOOLS` 列表：

```python
@tool
def my_tool(param: str) -> str:
    """Tool description for the LLM."""
    # your implementation
    return result

TOOLS = [
    calculator,
    get_current_time,
    read_file,
    web_search,
    my_tool,  # ← 加到这里
]
```

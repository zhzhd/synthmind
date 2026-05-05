"""FastAPI app initialization and router registration."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

HOST = "127.0.0.1"
PORT = 8000


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🟢 SynthMind backend starting on {HOST}:{PORT}")
    yield
    print("🟡 SynthMind backend stopped")


app = FastAPI(title="SynthMind API", version="0.1.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Register routers
from api.chat import router as chat_router
from api.models import router as models_router
from api.configs import router as configs_router
from api.skills_api import router as skills_router
from api.approve import router as approve_router
from api.todos import router as todos_router
from api.threads import router as threads_router

app.include_router(chat_router)
app.include_router(models_router)
app.include_router(configs_router)
app.include_router(skills_router)
app.include_router(approve_router)
app.include_router(todos_router)
app.include_router(threads_router)

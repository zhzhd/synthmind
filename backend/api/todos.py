"""Todo list REST endpoints."""

from fastapi import APIRouter, HTTPException

from services.todos import list_todos, create_todo, update_todo, delete_todo

router = APIRouter()


@router.get("/api/todos")
async def get_todos(status: str | None = None):
    return {"todos": list_todos(status)}


@router.post("/api/todos")
async def add_todo(body: dict):
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(400, "Title required")
    return create_todo(title=title, description=body.get("description", ""), status=body.get("status", "pending"))


@router.put("/api/todos/{todo_id}")
async def edit_todo(todo_id: str, body: dict):
    result = update_todo(todo_id, **{k: body[k] for k in ("title", "description", "status") if k in body})
    if not result:
        raise HTTPException(404, "Todo not found")
    return result


@router.delete("/api/todos/{todo_id}")
async def remove_todo(todo_id: str):
    if not delete_todo(todo_id):
        raise HTTPException(404, "Todo not found")
    return {"ok": True}

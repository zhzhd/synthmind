import { useEffect, useState } from "react";
import { useTranslation } from "../useLanguage";

interface TodoItem {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: number;
  updated_at: number;
}

const API_BASE = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "http://127.0.0.1:8000" : "";

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  in_progress: "🔄",
  completed: "✅",
  blocked: "🚫",
};

export default function TodoPanel() {
  const { t } = useTranslation();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/todos`);
      if (res.ok) {
        const data = await res.json();
        setTodos(data.todos || []);
      }
    } catch { /* backend may not be running */ }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    // Also reload when the window gains focus (user tabbed back)
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, []);

  const toggleStatus = async (todo: TodoItem) => {
    const nextStatus = todo.status === "completed" ? "pending" : "completed";
    try {
      await fetch(`${API_BASE}/api/todos/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch { /* ignore */ }
  };

  const activeTodos = todos.filter((t) => t.status !== "completed");
  const completedTodos = todos.filter((t) => t.status === "completed");

  return (
    <div className="sidebar-section">
      <div className="settings-list-header" style={{ cursor: "pointer" }} onClick={() => setCollapsed(!collapsed)}>
        <h3>{t("todo.title")} ({activeTodos.length})</h3>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <>
          {activeTodos.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
              {t("todo.empty")}
            </p>
          )}
          {activeTodos.map((td) => (
            <div key={td.id} className="todo-item" onClick={() => toggleStatus(td)} title={t("todo.toggle_hint")}>
              <span className="todo-icon">{STATUS_ICONS[td.status] || "⏳"}</span>
              <span className="todo-title">{td.title}</span>
            </div>
          ))}
          {completedTodos.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, color: "var(--text-dim)", cursor: "pointer" }}>
                {t("todo.completed_placeholder").replace("{n}", String(completedTodos.length))}
              </summary>
              {completedTodos.map((td) => (
                <div key={td.id} className="todo-item done" onClick={() => toggleStatus(td)} title={t("todo.toggle_hint")}>
                  <span className="todo-icon">✅</span>
                  <span className="todo-title" style={{ textDecoration: "line-through", opacity: 0.5 }}>{td.title}</span>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}

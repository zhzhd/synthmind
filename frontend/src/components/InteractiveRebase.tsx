import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  fetchRebasePlan,
  gitRebaseInteractive,
  fetchRebaseStatus,
  gitRebaseContinue,
  gitRebaseAbort,
  gitRebaseSkip,
} from "../lib/api";
import type { RebasePlanCommit, RebaseAction } from "../lib/api";
import { useGit } from "../GitContext";

const ACTIONS = ["pick", "reword", "edit", "squash", "fixup", "drop"] as const;

const ACTION_COLORS: Record<string, string> = {
  pick: "var(--accent-green)",
  reword: "var(--accent-blue)",
  edit: "var(--primary)",
  squash: "var(--text)",
  fixup: "var(--text-dim)",
  drop: "var(--danger)",
};

function SortableCommit({
  commit,
  action,
  onActionChange,
  index,
}: {
  commit: RebasePlanCommit;
  action: string;
  onActionChange: (hash: string, action: string) => void;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: commit.hash_full,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : action === "drop" ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`git-rebase-item ${isDragging ? "dragging" : ""}`}>
      <span className="git-rebase-drag-handle" {...attributes} {...listeners}>⠿</span>
      <span className="git-rebase-num">{index + 1}</span>
      <select
        className="git-rebase-action-select"
        value={action}
        onChange={(e) => onActionChange(commit.hash_full, e.target.value)}
        style={{ color: ACTION_COLORS[action] || "var(--text)" }}
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <span className="git-rebase-hash">{commit.hash}</span>
      <span className="git-rebase-msg">{commit.message}</span>
      <span className="git-rebase-author">{commit.author}</span>
    </div>
  );
}

export default function InteractiveRebase({ onClose }: { onClose: () => void }) {
  const { repoRoot, refresh, addConsole } = useGit();
  const [onto, setOnto] = useState("");
  const [plan, setPlan] = useState<RebasePlanCommit[]>([]);
  const [actions, setActions] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [rebaseStatus, setRebaseStatus] = useState<{ in_progress: boolean; onto?: string }>({ in_progress: false });
  const [showPlan, setShowPlan] = useState(false);

  // Check rebase status on mount
  useEffect(() => {
    fetchRebaseStatus(repoRoot).then(setRebaseStatus).catch(() => {});
  }, [repoRoot]);

  const loadPlan = async () => {
    if (!onto.trim()) return;
    setLoading(true);
    setShowPlan(true);
    try {
      const data = await fetchRebasePlan(repoRoot, onto.trim());
      setPlan(data.commits);
      const m = new Map<string, string>();
      for (const c of data.commits) {
        m.set(c.hash_full, "pick");
      }
      setActions(m);
    } catch (e: any) {
      addConsole("rebase-plan", `Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleActionChange = (hash: string, action: string) => {
    setActions((prev) => {
      const next = new Map(prev);
      next.set(hash, action);
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = plan.findIndex((c) => c.hash_full === active.id);
    const newIndex = plan.findIndex((c) => c.hash_full === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    setPlan(arrayMove(plan, oldIndex, newIndex));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const actionList: RebaseAction[] = plan.map((c) => ({
        action: (actions.get(c.hash_full) as RebaseAction["action"]) || "pick",
        commit_hash: c.hash_full,
        message: c.message,
      }));
      const r = await gitRebaseInteractive(repoRoot, onto.trim(), actionList);
      addConsole("rebase-interactive", r.stdout || r.stderr || "Rebase completed");
      setShowPlan(false);
      setPlan([]);
      refresh();
      onClose();
    } catch (e: any) {
      addConsole("rebase-interactive", `Error: ${e.message}`);
      // Refresh status — likely conflict
      fetchRebaseStatus(repoRoot).then(setRebaseStatus).catch(() => {});
    } finally {
      setExecuting(false);
    }
  };

  const handleContinue = async () => {
    try {
      const r = await gitRebaseContinue(repoRoot);
      addConsole("rebase-continue", r.stdout || r.stderr || "");
      refresh();
    } catch (e: any) {
      addConsole("rebase-continue", `Error: ${e.message}`);
    }
    fetchRebaseStatus(repoRoot).then(setRebaseStatus).catch(() => {});
  };

  const handleAbort = async () => {
    try {
      await gitRebaseAbort(repoRoot);
      addConsole("rebase-abort", "Rebase aborted");
      setRebaseStatus({ in_progress: false });
      refresh();
    } catch (e: any) {
      addConsole("rebase-abort", `Error: ${e.message}`);
    }
  };

  const handleSkip = async () => {
    try {
      const r = await gitRebaseSkip(repoRoot);
      addConsole("rebase-skip", r.stdout || r.stderr || "");
      refresh();
    } catch (e: any) {
      addConsole("rebase-skip", `Error: ${e.message}`);
    }
    fetchRebaseStatus(repoRoot).then(setRebaseStatus).catch(() => {});
  };

  const activeCount = plan.filter((c) => actions.get(c.hash_full) !== "drop").length;

  // Rebase in progress banner
  if (rebaseStatus.in_progress) {
    return (
      <div className="git-rebase-panel">
        <div className="git-rebase-header">Rebase In Progress</div>
        <div className="git-rebase-status-banner">
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-dim)" }}>
            A rebase is currently in progress{rebaseStatus.onto ? ` onto ${rebaseStatus.onto.substring(0, 7)}` : ""}.
            Resolve conflicts then continue, or abort.
          </p>
        </div>
        <div className="git-rebase-actions">
          <button className="btn-sm btn-primary" onClick={handleContinue}>Continue</button>
          <button className="btn-sm" onClick={handleSkip}>Skip</button>
          <button className="btn-sm btn-danger" onClick={handleAbort}>Abort</button>
          <button className="btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="git-rebase-panel">
      <div className="git-rebase-header">
        <span>Interactive Rebase</span>
        <button className="btn-xs" onClick={onClose}>✕</button>
      </div>

      {/* Onto branch selector */}
      <div className="git-rebase-onto-row">
        <span className="git-rebase-label">Rebase onto:</span>
        <input
          type="text"
          className="git-rebase-onto-input"
          value={onto}
          onChange={(e) => setOnto(e.target.value)}
          placeholder="branch name or commit hash"
          onKeyDown={(e) => e.key === "Enter" && loadPlan()}
        />
        <button className="btn-sm" onClick={loadPlan} disabled={loading || !onto.trim()}>
          {loading ? "..." : "Load Plan"}
        </button>
      </div>

      {/* Rebase todo list */}
      {showPlan && (
        <div className="git-rebase-plan">
          {plan.length === 0 && !loading && (
            <div className="git-rebase-empty" style={{ padding: 12, color: "var(--text-dim)", fontSize: 11 }}>
              No commits to rebase (branch is up to date).
            </div>
          )}
          {plan.length > 0 && (
            <>
              <div className="git-rebase-stats">
                <span>{plan.length} commits</span>
                <span>{activeCount} active</span>
                <span>{plan.length - activeCount} dropped</span>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={plan.map((c) => c.hash_full)} strategy={verticalListSortingStrategy}>
                  <div className="git-rebase-list">
                    {plan.map((c, i) => (
                      <SortableCommit
                        key={c.hash_full}
                        commit={c}
                        action={actions.get(c.hash_full) || "pick"}
                        onActionChange={handleActionChange}
                        index={i}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <div className="git-rebase-execute">
                <button
                  className="btn-sm btn-primary"
                  onClick={handleExecute}
                  disabled={executing || activeCount === 0}
                >
                  {executing ? "Rebasing..." : `Rebase (${activeCount} commits)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

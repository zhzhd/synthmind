import { useGit, type ToastInfo } from "../GitContext";

const TOAST_ICONS: Record<ToastInfo["type"], string> = {
  loading: "⟳",
  success: "✓",
  error: "✗",
  info: "ℹ",
};

export default function GitToast() {
  const { toasts, dismissToast } = useGit();
  if (toasts.length === 0) return null;

  return (
    <div className="git-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`git-toast git-toast-${t.type}`} onClick={() => dismissToast(t.id)}>
          <span className="git-toast-icon">{TOAST_ICONS[t.type]}</span>
          <span className="git-toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

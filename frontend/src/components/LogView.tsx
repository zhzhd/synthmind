import { useEffect, useState } from "react";
import { fetchGitLogDetail } from "../lib/api";
import type { GitLogEntry } from "../lib/api";

export default function LogView({ repoRoot }: { repoRoot: string }) {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async (reset = false) => {
    setLoading(true);
    try {
      const s = reset ? 0 : skip;
      const data = await fetchGitLogDetail(repoRoot, 20, s);
      if (reset) {
        setEntries(data.commits);
      } else {
        setEntries((prev) => [...prev, ...data.commits]);
      }
      setSkip(s + data.commits.length);
      setHasMore(data.commits.length >= 20);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(true); }, [repoRoot]);

  return (
    <div className="git-log-view">
      <div className="git-log-list">
        {entries.map((c) => {
          const isExpanded = expanded === c.hash;
          return (
            <div key={c.hash}>
              <div className="git-log-item" onClick={() => setExpanded(isExpanded ? null : c.hash)}>
                <span className="git-log-graph">{c.graph_line}</span>
                <span className="git-log-hash">{c.hash}</span>
                <span className="git-log-msg">{c.message}</span>
                <span className="git-log-time">{c.time}</span>
              </div>
              {isExpanded && (
                <div className="git-log-detail">
                  <div className="git-log-detail-row"><strong>Author:</strong> {c.author}</div>
                  <div className="git-log-detail-row"><strong>Hash:</strong> {c.hash_full}</div>
                  {c.refs && <div className="git-log-detail-row"><strong>Refs:</strong> <span className="git-log-refs">{c.refs}</span></div>}
                </div>
              )}
            </div>
          );
        })}
        {loading && <div className="git-log-loading">Loading...</div>}
        {!loading && hasMore && (
          <button className="btn-sm git-log-more" onClick={() => load()}>Load more</button>
        )}
      </div>
    </div>
  );
}

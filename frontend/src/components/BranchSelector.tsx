import { useState, useEffect, useRef } from "react";

interface Props {
  branches: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultOption?: string;
}

export default function BranchSelector({ branches, value, onChange, placeholder, defaultOption }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || defaultOption || "");
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync query when value changes externally
  useEffect(() => {
    if (!open) setQuery(value || defaultOption || "");
  }, [value, defaultOption, open]);

  // Fuzzy filter: branch contains query (case-insensitive)
  const filtered = query
    ? branches.filter((b) => b.toLowerCase().includes(query.toLowerCase()))
    : branches;

  const handleSelect = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  return (
    <div className="branch-selector" ref={ref}>
      <input
        type="text"
        value={open ? query : (value || defaultOption || "")}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(value || ""); setOpen(true); }}
        placeholder={placeholder || "Branch..."}
      />
      {open && (
        <div className="branch-selector-dropdown">
          {defaultOption && (
            <div className="branch-selector-option" onClick={() => handleSelect("")}>
              {defaultOption}
            </div>
          )}
          {filtered.length === 0 && (
            <div className="branch-selector-empty">No matching branches</div>
          )}
          {filtered.map((name) => (
            <div
              key={name}
              className={`branch-selector-option ${name === value ? "selected" : ""} ${
                ["origin/", "upstream/"].some((p) => name.startsWith(p)) ? "remote" : ""
              }`}
              onClick={() => handleSelect(name)}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "dark" | "light";
type FontKey = "inter" | "system" | "serif" | "mono";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  font: FontKey;
  setFont: (f: FontKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem("synthmind_theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* ignore */ }
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function getInitialFont(): FontKey {
  try {
    const saved = localStorage.getItem("synthmind_font");
    if (saved === "inter" || saved === "system" || saved === "serif" || saved === "mono") return saved;
  } catch { /* ignore */ }
  return "inter";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [font, setFontState] = useState<FontKey>(getInitialFont);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("synthmind_theme", t); } catch { /* ignore */ }
  };

  const setFont = (f: FontKey) => {
    setFontState(f);
    try { localStorage.setItem("synthmind_font", f); } catch { /* ignore */ }
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-font", font);
  }, [font]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, font, setFont }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

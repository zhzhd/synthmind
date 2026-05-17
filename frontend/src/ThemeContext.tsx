import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "dark" | "light" | "oled" | "sepia";
type FontKey = "inter" | "system" | "serif" | "mono" | "pingfang" | "rounded" | "emoji";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  font: FontKey;
  setFont: (f: FontKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const VALID_THEMES: readonly Theme[] = ["dark", "light", "oled", "sepia"];
const VALID_FONTS: readonly FontKey[] = ["inter", "system", "serif", "mono", "pingfang", "rounded", "emoji"];

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem("synthmind_theme");
    if (saved && VALID_THEMES.includes(saved as Theme)) return saved as Theme;
  } catch { /* ignore */ }
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function getInitialFont(): FontKey {
  try {
    const saved = localStorage.getItem("synthmind_font");
    if (saved && VALID_FONTS.includes(saved as FontKey)) return saved as FontKey;
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

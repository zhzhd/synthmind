import { useContext } from "react";
import { LanguageContext, type LanguageContextValue } from "./LanguageContext";

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}

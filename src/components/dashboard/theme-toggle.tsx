"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";

/**
 * Comutator temă light/dark cu iconițe și accesibilitate.
 *
 * `resolvedTheme` din next-themes nu poate fi determinat pe server (depinde
 * de localStorage / preferința sistemului citită din browser). Dacă am
 * randa `aria-label`-ul direct pe baza lui, am avea un mismatch de hidratare:
 * server randează "Comută la temă întunecată", client (după ce next-themes
 * își citește starea) randează "Comută la temă luminoasă".
 *
 * Soluție: `useMounted()` (useSyncExternalStore) returnează `false` atât la
 * SSR cât și la prima hidratare, deci `isDark` este `false` în ambele → output
 * identic → fără mismatch. După hidratare devine `true` și se re-randează cu
 * tema reală. Iconițele Sun/Moon sunt conduse de clase CSS `dark:` (pe baza
 * clasei de pe `<html>`, injectată de next-themes înainte de hidratare), deci
 * nu pâlpâie.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Comută la temă luminoasă" : "Comută la temă întunecată"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-9 w-9"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Comută tema</span>
    </Button>
  );
}

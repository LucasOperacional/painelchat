import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "central-theme";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle({ variant }: { variant?: "icon" }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const isDark = theme === "dark";

  if (variant === "icon") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="size-9 rounded-xl text-muted-foreground hover:text-foreground"
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    );
  }

  return (
    <SidebarMenuButton
      onClick={() => setTheme(isDark ? "light" : "dark")}
      tooltip={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="w-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span>{isDark ? "Tema claro" : "Tema escuro"}</span>
    </SidebarMenuButton>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

const STORAGE_KEY = "kreatae-theme";
type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", t === "light");
  root.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* noop */
  }
}

function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => setTheme(readTheme()), []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
      className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium text-zinc-500 transition-colors hover:text-zinc-200"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-zinc-600" />
      ) : (
        <Moon className="h-4 w-4 text-zinc-600" />
      )}
      {theme === "dark" ? "Modo claro" : "Modo escuro"}
    </button>
  );
}

export function ThemeSelector() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  function pick(t: Theme) {
    applyTheme(t);
    setTheme(t);
  }

  const options: {
    key: Theme;
    label: string;
    desc: string;
    icon: typeof Moon;
    preview: string;
  }[] = [
    {
      key: "dark",
      label: "Escuro",
      desc: "Visual original do radar — ideal à noite.",
      icon: Moon,
      preview: "bg-[#0c0c10] border-white/15",
    },
    {
      key: "light",
      label: "Claro",
      desc: "Alto contraste para uso diurno.",
      icon: Sun,
      preview: "bg-white border-black/15",
    },
  ];

  if (!mounted) return <div className="h-28 animate-pulse rounded-xl bg-white/[0.03]" />;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const active = theme === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => pick(o.key)}
            className={`rounded-xl border p-4 text-left transition-all ${
              active
                ? "border-volt/60 bg-volt/[0.07]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-volt/30"
            }`}
          >
            <div className={`mb-3 h-14 rounded-lg border ${o.preview} p-2`}>
              <div
                className={`h-1.5 w-2/3 rounded-full ${
                  o.key === "dark" ? "bg-white/25" : "bg-black/20"
                }`}
              />
              <div
                className={`mt-1.5 h-1.5 w-1/3 rounded-full ${
                  o.key === "dark" ? "bg-[#d1f64b]" : "bg-[#4e8f0a]"
                }`}
              />
            </div>
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-zinc-100">
              <o.icon className="h-4 w-4 text-volt" />
              {o.label}
              {active && (
                <span className="ml-auto rounded-full bg-volt px-2 py-0.5 text-[10px] font-bold text-onvolt">
                  ATIVO
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] text-zinc-500">{o.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

/** Script (string) executado antes da hidratação para evitar flash de tema. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t!=="light";document.documentElement.classList.toggle("light",t==="light");document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

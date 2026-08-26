"use client";

import { useState, useSyncExternalStore } from "react";
import { Clock, EyeOff } from "lucide-react";

const CHAVE = "kreatae_relogios";

const FUSOS = [
  { rotulo: "Brasília", zona: "America/Sao_Paulo" },
  { rotulo: "Portugal", zona: "Europe/Lisbon" },
];

/**
 * Marca o minuto atual. useSyncExternalStore em vez de useState+useEffect:
 * o servidor devolve null, entao nada de relogio e renderizado na
 * hidratacao — o que evita divergencia entre servidor e cliente sem
 * precisar de setState dentro de efeito.
 */
function useMinuto(): number | null {
  return useSyncExternalStore(
    (avisar) => {
      const t = setInterval(avisar, 15_000);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}

function hora(zona: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zona,
  }).format(new Date());
}

export function WorldClock() {
  const minuto = useMinuto();
  const [visivel, setVisivel] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(CHAVE) !== "off";
    } catch {
      return true;
    }
  });

  function alternar(novo: boolean) {
    setVisivel(novo);
    try {
      window.localStorage.setItem(CHAVE, novo ? "on" : "off");
    } catch {
      /* modo privado: a preferencia so nao persiste */
    }
  }

  // Ate a primeira marcacao do cliente nao ha o que mostrar.
  if (minuto === null) return null;

  if (!visivel) {
    return (
      <button
        type="button"
        onClick={() => alternar(true)}
        title="Mostrar relógios"
        className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium text-zinc-500 transition-colors hover:text-zinc-200"
      >
        <Clock className="h-[18px] w-[18px]" />
        Relógios
      </button>
    );
  }

  return (
    <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
          <Clock className="h-3 w-3" />
          Fusos
        </span>
        <button
          type="button"
          onClick={() => alternar(false)}
          title="Ocultar relógios"
          aria-label="Ocultar relógios"
          className="text-zinc-700 transition-colors hover:text-zinc-300"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1.5 space-y-1">
        {FUSOS.map((f) => (
          <div key={f.zona} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12px] text-zinc-500">{f.rotulo}</span>
            <span className="font-display text-[14px] font-bold tabular-nums text-zinc-200">
              {hora(f.zona)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

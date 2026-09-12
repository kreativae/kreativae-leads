"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Easter egg: 3 cliques no ícone + seta-direita, seta-direita + tecla A
 * destranca o painel escondido de logs/segredos em /configuracoes/logs.
 * A sequência de teclado só é observada depois dos 3 cliques, pra não
 * atrapalhar quem está digitando em qualquer campo da tela normalmente.
 */
const RESET_MS = 4000;

export function SecretDebugTrigger() {
  const router = useRouter();
  const [stage, setStage] = useState(0); // 0-3 = cliques; 3 = ouvindo teclado; 4/5 = setas ok
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStage(0), RESET_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (stage < 3) return;
    function onKeyDown(e: KeyboardEvent) {
      if (stage === 3 && e.key === "ArrowRight") {
        setStage(4);
        arm();
      } else if (stage === 4 && e.key === "ArrowRight") {
        setStage(5);
        arm();
      } else if (stage === 5 && e.key.toLowerCase() === "a") {
        setStage(0);
        if (timer.current) clearTimeout(timer.current);
        router.push("/configuracoes/logs");
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "a") {
        setStage(0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, arm, router]);

  function onClick() {
    setStage((s) => (s < 3 ? s + 1 : s));
    arm();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Debug"
      title=""
      className="fixed right-4 top-4 z-40 rounded-full p-1.5 text-zinc-700 opacity-30 transition-opacity hover:opacity-60 md:right-6 md:top-6"
    >
      <Bug className="h-4 w-4" />
    </button>
  );
}

/** Botão flutuante (estilo bolha do WhatsApp) — acesso direto aos logs, só para o proprietário. */
export function DebugFab({ visible }: { visible: boolean }) {
  const router = useRouter();
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/configuracoes/logs")}
      aria-label="Ver logs"
      title="Logs & segredos"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-volt text-onvolt shadow-lg shadow-volt/30 transition-transform hover:scale-110"
    >
      <Bug className="h-6 w-6" />
    </button>
  );
}

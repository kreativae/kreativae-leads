"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Easter egg estilo Konami code: 3 cliques no ícone + seta-direita,
 * seta-direita + tecla A. A sequência de teclado só é observada depois
 * dos 3 cliques, pra não atrapalhar quem está digitando em qualquer
 * campo da tela normalmente.
 */
const RESET_MS = 4000;

/**
 * Chave de sessão usada para pular o gate de /configuracoes/logs quando a
 * navegação já veio de um clique autorizado (FAB ou sequência secreta) —
 * sem ela, entrar direto pela URL cai na tela travada. Some do
 * sessionStorage no primeiro uso, então cada nova visita exige refazer a
 * sequência de novo.
 */
const UNLOCK_FLAG = "kreativae_logs_unlock";

export function markLogsUnlocked() {
  try {
    sessionStorage.setItem(UNLOCK_FLAG, "1");
  } catch {
    /* sessionStorage indisponível (modo privado etc.) — sem problema, só cai no gate */
  }
}

export function consumeLogsUnlocked(): boolean {
  try {
    if (sessionStorage.getItem(UNLOCK_FLAG) !== "1") return false;
    sessionStorage.removeItem(UNLOCK_FLAG);
    return true;
  } catch {
    return false;
  }
}

function useSecretSequence(onComplete: () => void) {
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
        onComplete();
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "a") {
        setStage(0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, arm, onComplete]);

  const onClick = useCallback(() => {
    setStage((s) => (s < 3 ? s + 1 : s));
    arm();
  }, [arm]);

  return onClick;
}

/** Ícone quase invisível no canto de Configurações — a sequência secreta de verdade. */
export function SecretDebugTrigger() {
  const router = useRouter();
  const onClick = useSecretSequence(() => {
    markLogsUnlocked();
    router.push("/configuracoes/logs");
  });

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
      onClick={() => {
        markLogsUnlocked();
        router.push("/configuracoes/logs");
      }}
      aria-label="Ver logs"
      title="Logs & segredos"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-volt text-onvolt shadow-lg shadow-volt/30 transition-transform hover:scale-110"
    >
      <Bug className="h-6 w-6" />
    </button>
  );
}

/**
 * Tela de bloqueio de /configuracoes/logs — quem cai na página sem vir do
 * FAB ou da sequência (URL direta, favorito, aba antiga) precisa refazer
 * a mesma sequência aqui pra ver o conteúdo.
 */
export function LogsLockGate({ onUnlock }: { onUnlock: () => void }) {
  const onClick = useSecretSequence(onUnlock);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] py-24 text-center">
      <Lock className="h-8 w-8 text-zinc-600" />
      <div>
        <p className="text-[14px] font-semibold text-zinc-200">Acesso restrito</p>
        <p className="mt-1 text-[12.5px] text-zinc-500">
          Repita a sequência secreta pra destravar:{" "}
          <span className="cursor-default select-none blur-[5px] transition-[filter] duration-200 hover:blur-none">
            clique no bug 3x, depois → → A.
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label="Debug"
        className="rounded-full border border-white/10 bg-white/[0.03] p-2.5 text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-300"
      >
        <Bug className="h-5 w-5" />
      </button>
    </div>
  );
}

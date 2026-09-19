"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Loader2, Lock } from "lucide-react";
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
  const [erro, setErro] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const erroTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStage(0), RESET_MS);
  }, []);

  // Tecla errada: mantem os passos ja certos visiveis (em vermelho) por um
  // instante antes de zerar, em vez de sumir na hora — da pra "ver" onde
  // errou.
  const falhar = useCallback(() => {
    setErro(true);
    if (timer.current) clearTimeout(timer.current);
    if (erroTimer.current) clearTimeout(erroTimer.current);
    erroTimer.current = setTimeout(() => {
      setErro(false);
      setStage(0);
    }, 500);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (erroTimer.current) clearTimeout(erroTimer.current);
    },
    [],
  );

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
        setStage(6);
        if (timer.current) clearTimeout(timer.current);
        onComplete();
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "a") {
        falhar();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, arm, onComplete, falhar]);

  const onClick = useCallback(() => {
    setStage((s) => (s < 3 ? s + 1 : s));
    arm();
  }, [arm]);

  return { onClick, stage, erro };
}

/** Seis passos da sequencia (3 cliques + 2 setas + "a") — verde a cada acerto, vermelho se errar. */
function SequenceDots({ stage, erro }: { stage: number; erro: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full transition-colors ${
            i >= stage ? "bg-white/10" : erro ? "bg-rose-400" : "bg-emerald-400"
          }`}
        />
      ))}
    </div>
  );
}

/** Ícone quase invisível no canto de Configurações — a sequência secreta de verdade. */
export function SecretDebugTrigger() {
  const router = useRouter();
  const { onClick, stage, erro } = useSecretSequence(() => {
    markLogsUnlocked();
    router.push("/configuracoes/logs");
  });

  return (
    <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-1.5 md:right-6 md:top-6">
      <button
        type="button"
        onClick={onClick}
        aria-label="Debug"
        title=""
        className="rounded-full p-1.5 text-zinc-700 opacity-30 transition-opacity hover:opacity-60"
      >
        <Bug className="h-4 w-4" />
      </button>
      {stage > 0 && <SequenceDots stage={stage} erro={erro} />}
    </div>
  );
}

/**
 * Botão flutuante (estilo bolha do WhatsApp) — exige a mesma sequência
 * secreta do ícone escondido, sempre. Não existe atalho de acesso direto,
 * nem pro dono da conta.
 */
export function DebugFab({ visible }: { visible: boolean }) {
  const router = useRouter();
  const { onClick, stage, erro } = useSecretSequence(() => {
    markLogsUnlocked();
    router.push("/configuracoes/logs");
  });
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {stage > 0 && (
        <div className="rounded-full border border-white/10 bg-ink/90 px-3 py-1.5 shadow-lg">
          <SequenceDots stage={stage} erro={erro} />
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label="Ver logs"
        title="Logs & segredos — repita a sequência secreta"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-volt text-onvolt shadow-lg shadow-volt/30 transition-transform hover:scale-110"
      >
        <Bug className="h-6 w-6" />
      </button>
    </div>
  );
}

/**
 * Tela de bloqueio de /configuracoes/logs — quem cai na página sem vir do
 * FAB ou da sequência (URL direta, favorito, aba antiga) precisa refazer
 * a mesma sequência aqui pra ver o conteúdo.
 */
export function LogsLockGate({ onUnlock }: { onUnlock: () => void }) {
  const { onClick, stage, erro } = useSecretSequence(onUnlock);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] py-24 text-center">
      <Lock className="h-8 w-8 text-zinc-600" />
      <div>
        <p className="text-[14px] font-semibold text-zinc-200">Acesso restrito</p>
        <p className="mt-1 text-[12.5px] text-zinc-500">Repita a sequência secreta pra destravar.</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label="Debug"
        className="rounded-full border border-white/10 bg-white/[0.03] p-2.5 text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-300"
      >
        <Bug className="h-5 w-5" />
      </button>
      <SequenceDots stage={stage} erro={erro} />
    </div>
  );
}

/** Interruptor padrão dos toggles de debug (painel, easter egg, atalho do FAB) — Conta e Logs & segredos usam o mesmo. */
export function DebugSwitch({
  enabled,
  busy,
  onToggle,
  onLabel,
  offLabel,
}: {
  enabled: boolean | null;
  busy: boolean;
  onToggle: () => void;
  onLabel: string;
  offLabel: string;
}) {
  if (enabled === null)
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-volt" />
      </div>
    );
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-zinc-100">
          {enabled ? "Ativado" : "Desativado"}
        </div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-500">
          {enabled ? onLabel : offLabel}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        disabled={busy}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          enabled ? "bg-volt" : "bg-white/25"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

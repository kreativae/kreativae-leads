"use client";

import { Trash2 } from "lucide-react";

export function SecretInput({
  label,
  hint,
  masked,
  fromEnv,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  hint: string;
  masked?: string | null;
  fromEnv?: boolean;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-zinc-400">{label}</label>
        {masked && !fromEnv && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-300 hover:underline"
          >
            <Trash2 className="h-3 w-3" />
            Remover
          </button>
        )}
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          masked
            ? `Configurada (${masked})${fromEnv ? " via ambiente" : ""} — digite para substituir`
            : "Cole a chave aqui"
        }
        className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 font-mono text-[12.5px] text-zinc-100 outline-none placeholder:font-sans placeholder:text-zinc-600 focus:border-volt/50"
      />
      <p className="mt-1 text-[11.5px] text-zinc-600">{hint}</p>
    </div>
  );
}

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // src/db/index.ts exige DATABASE_URL so pra existir (o Pool da pg e
    // preguicoso, nao conecta na hora) — modulos como automation.ts importam
    // "@/db" no topo mesmo quando o teste nunca faz uma query de verdade.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

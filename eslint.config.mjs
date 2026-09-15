import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Regras novas do react-hooks voltadas pro React Compiler (que este
      // projeto nao usa). Disparam em cima do padrao "busca dado no mount
      // via useEffect", que é o jeito padrão e correto de fazer isso sem
      // framework de data-fetching — e em Date.now() num Server Component
      // (roda uma vez por request no servidor, não há "re-render" para
      // instabilizar). Aviso, não erro: continuam visíveis sem travar a CI
      // por um padrão já usado de propósito em toda a base.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

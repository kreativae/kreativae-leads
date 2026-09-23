"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import {
  Crosshair,
  History,
  LogOut,
  MessageSquare,
  Radar,
  Search,
  Settings2,
  Sparkles,
  SquareKanban,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import { ThemeToggle } from "./theme";
import { WorldClock } from "./world-clock";
import { LogoKreativ } from "./logo";

const AUTH_PATHS = ["/login", "/registrar"];

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

function useMe(pathname: string) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (AUTH_PATHS.some((p) => pathname.startsWith(p))) return;
    let alive = true;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(pathname)}`;
          return;
        }
        const data = (await res.json()) as { user: (Me & { mustChangePassword: boolean }) | null };
        if (!alive) return;
        setMe(data.user);
        if (data.user?.mustChangePassword && !pathname.startsWith("/conta")) {
          window.location.href = "/conta?forcar=1";
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pathname]);
  return me;
}

async function doLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

function UserBlock({ me }: { me: Me | null }) {
  if (!me) return null;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <Link href="/conta" className="group flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-volt/30 bg-volt/[0.08] font-display text-[13px] font-bold text-volt">
          {me.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-bold text-zinc-100 group-hover:text-white">
            {me.name}
          </div>
          <div className="truncate text-[10.5px] text-zinc-500">{me.email}</div>
        </div>
        <UserRound className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-volt" />
      </Link>
      <button
        type="button"
        onClick={doLogout}
        className="mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair da conta
      </button>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Radar", icon: Radar },
  { href: "/buscar", label: "Nova busca", icon: Crosshair },
  { href: "/buscador", label: "Buscador", icon: Search },
  { href: "/ia", label: "IA", icon: Sparkles },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/crm", label: "CRM", icon: SquareKanban },
  { href: "/conversas", label: "Conversas", icon: MessageSquare },
  { href: "/pesquisas", label: "Pesquisas", icon: History },
];

async function lerOrdemNavSalva(): Promise<string[] | null> {
  try {
    const res = await fetch("/api/settings/nav-order");
    const data = (await res.json()) as { ok: boolean; order?: string[] | null };
    return data.ok ? (data.order ?? null) : null;
  } catch {
    return null;
  }
}

/** Aplica a ordem salva aos itens ainda existentes; o que não estava salvo (item novo, ou reapareceu) vai pro fim, na ordem padrão. */
function ordenarNav(itens: typeof NAV, ordemSalva: string[] | null): typeof NAV {
  if (!ordemSalva) return itens;
  const porHref = new Map(itens.map((i) => [i.href, i]));
  const ordenados = ordemSalva.map((h) => porHref.get(h)).filter((i): i is (typeof NAV)[number] => !!i);
  const faltando = itens.filter((i) => !ordemSalva.includes(i.href));
  return [...ordenados, ...faltando];
}

function Wordmark() {
  return (
    <div className="leading-none">
      {/* text-white = #fff no tema escuro e #0c0d10 no claro: a mesma marca
          serve aos dois, sem duplicar arquivo. */}
      <LogoKreativ className="h-[26px] w-auto text-white" />
      <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.32em] text-zinc-500">
        Radar de Leads
      </div>
    </div>
  );
}

function useConversationsState() {
  const [unread, setUnread] = useState(0);
  // Comeca ligado: se comecasse desligado, "Conversas" piscaria entrando no
  // menu a cada carregamento de pagina.
  const [waEnabled, setWaEnabled] = useState(true);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/conversations?summary=1");
        if (!res.ok) return;
        const data = (await res.json()) as {
          unread?: number;
          wa_enabled?: boolean;
        };
        if (!alive) return;
        if (typeof data.unread === "number") setUnread(data.unread);
        if (typeof data.wa_enabled === "boolean") setWaEnabled(data.wa_enabled);
      } catch {
        /* offline */
      }
    }
    load();
    const t = setInterval(load, 15_000);
    const onRead = () => load();
    window.addEventListener("kreatae:conversations-read", onRead);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("kreatae:conversations-read", onRead);
    };
  }, []);
  return { unread, waEnabled };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { unread, waEnabled } = useConversationsState();
  // Omnichannel desligado em Configuracoes some do menu.
  const navItems = waEnabled ? NAV : NAV.filter((i) => i.href !== "/conversas");
  const me = useMe(pathname);
  const [menuAberto, setMenuAberto] = useState(false);

  // null ate carregar: compartilhada entre aparelhos (o mesmo login em
  // duas maquinas via o mesmo menu), por isso vem do banco, nao do
  // localStorage — que ficaria diferente em cada navegador.
  const [ordemSalva, setOrdemSalva] = useState<string[] | null>(null);
  useEffect(() => {
    lerOrdemNavSalva().then(setOrdemSalva);
  }, []);
  const navItemsOrdenados = useMemo(
    () => ordenarNav(navItems, ordemSalva),
    [navItems, ordemSalva],
  );
  // Segura e arrasta pra reordenar (Reorder do framer-motion cuida de
  // distinguir arrastar de um clique normal, que continua so navegando).
  // onReorder dispara a cada troca durante o arrastar, entao so grava no
  // banco depois de um instante parado — senao um arrastar de 3 posicoes
  // dispara 3 PUTs em sequencia por nada.
  const salvarOrdemTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function aoReordenar(novaOrdem: typeof NAV) {
    const hrefs = novaOrdem.map((i) => i.href);
    setOrdemSalva(hrefs);
    if (salvarOrdemTimer.current) clearTimeout(salvarOrdemTimer.current);
    salvarOrdemTimer.current = setTimeout(() => {
      fetch("/api/settings/nav-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: hrefs }),
      }).catch(() => {
        /* falhou salvar — a ordem local ja mudou, so nao persiste dessa vez */
      });
    }, 500);
  }

  if (AUTH_PATHS.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  const forceBanner = me?.mustChangePassword;

  return (
    <div className="min-h-screen">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="glow-volt absolute inset-0" />
      </div>

      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-ink/80 backdrop-blur-xl lg:flex">
        <div className="px-6 pb-8 pt-7">
          <Wordmark />
        </div>
        <Reorder.Group
          as="nav"
          axis="y"
          values={navItemsOrdenados}
          onReorder={aoReordenar}
          className="flex-1 space-y-1 px-3"
        >
          {navItemsOrdenados.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const showBadge = item.href === "/conversas" && unread > 0;
            return (
              <Reorder.Item
                key={item.href}
                value={item}
                as="div"
                style={{ touchAction: "none" }}
                whileDrag={{
                  scale: 1.03,
                  zIndex: 10,
                  backgroundColor: "var(--color-ink)",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
                  cursor: "grabbing",
                }}
                className={`group relative flex cursor-grab items-center rounded-xl transition-colors active:cursor-grabbing ${
                  active ? "text-white" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl border border-volt/20 bg-volt/[0.07]"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Link
                  href={item.href}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className="relative flex min-w-0 flex-1 select-none items-center gap-3 px-3.5 py-2.5 text-[13.5px] font-medium"
                >
                  <item.icon
                    className={`h-4 w-4 shrink-0 ${active ? "text-volt" : "text-zinc-600 group-hover:text-zinc-400"}`}
                    strokeWidth={2}
                  />
                  <span className="truncate">{item.label}</span>
                  {showBadge && (
                    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-volt px-1.5 text-[10.5px] font-bold tabular-nums text-onvolt">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        <div className="space-y-1 border-t border-white/[0.06] px-3 py-4">
          <WorldClock />
          <ThemeToggle />
          <Link
            href="/configuracoes"
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
              pathname.startsWith("/configuracoes") ? "text-white" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <Settings2 className={`h-4 w-4 ${pathname.startsWith("/configuracoes") ? "text-volt" : "text-zinc-600"}`} strokeWidth={2} />
            Configurações
          </Link>
        </div>
        <div className="px-3 pb-3">
          <UserBlock me={me} />
        </div>
        <div className="border-t border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-volt" />
            </span>
            Sistema online
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-600">
            OpenStreetMap · Google Places · WhatsApp Cloud API
          </p>
        </div>
      </aside>

      {/* Mobile top bar */}
      {/* fixed, nao sticky: sticky depende de nenhum ancestral ter overflow,
          e qualquer overflow futuro o quebraria em silencio. */}
      <header className="app-header-mobile fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/[0.08] bg-ink px-4 lg:hidden">
        {/* So o simbolo: com 7 itens de menu, a tipografia nao cabe. */}
        <Link href="/" aria-label="Início" className="shrink-0">
          <LogoKreativ markOnly className="h-7 w-auto text-white" />
        </Link>
        <nav className="flex items-center gap-0.5">
          {navItemsOrdenados.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const showBadge = item.href === "/conversas" && unread > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`relative rounded-lg p-2 ${active ? "bg-volt/10 text-volt" : "text-zinc-500"}`}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {showBadge && (
                  <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-volt" />
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            aria-expanded={menuAberto}
            aria-label="Conta e preferências"
            className={`ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold transition-colors ${
              menuAberto
                ? "border-volt bg-volt text-onvolt"
                : "border-volt/30 bg-volt/[0.08] text-volt"
            }`}
          >
            {me ? me.name.slice(0, 1).toUpperCase() : <UserRound className="h-4 w-4" />}
          </button>
        </nav>
      </header>

      {/* Conta, tema e relogios só existiam na barra lateral do desktop. */}
      <AnimatePresence>
        {menuAberto && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuAberto(false)}
              className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            />
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="app-menu-mobile fixed inset-x-0 z-40 space-y-1 border-b border-white/[0.08] bg-ink px-3 pb-4 pt-2 shadow-2xl lg:hidden"
            >
              {me && (
                <Link
                  href="/conta"
                  onClick={() => setMenuAberto(false)}
                  className="group mb-2 flex items-center gap-3 rounded-xl px-3.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-zinc-100">
                      {me.name}
                    </div>
                    <div className="truncate text-[11.5px] text-zinc-500">{me.email}</div>
                  </div>
                  <UserRound className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-volt" />
                </Link>
              )}
              <Link
                href="/configuracoes"
                onClick={() => setMenuAberto(false)}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium text-zinc-300"
              >
                <Settings2 className="h-4 w-4 text-zinc-600" strokeWidth={2} />
                Configurações
              </Link>
              <ThemeToggle />
              <WorldClock />
              <button
                type="button"
                onClick={doLogout}
                className="mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-rose-300"
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="app-content-offset relative lg:pl-60">
        {forceBanner && (
          <div className="flex items-center gap-2.5 border-b border-amber-300/25 bg-amber-300/[0.08] px-4 py-2.5 text-[12.5px] text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
            Defina uma nova senha em Conta para continuar usando o sistema.
          </div>
        )}
        <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-8 md:px-8 md:pt-10">
          {children}
        </main>
      </div>
    </div>
  );
}

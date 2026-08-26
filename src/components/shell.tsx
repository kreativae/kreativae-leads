"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Crosshair,
  History,
  LogOut,
  MessageSquare,
  Radar,
  Settings2,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import { ThemeToggle } from "./theme";

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
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/conversas", label: "Conversas", icon: MessageSquare },
  { href: "/pesquisas", label: "Pesquisas", icon: History },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];

function Wordmark() {
  return (
    <div className="leading-none">
      <div className="font-display text-[26px] font-700 tracking-tight text-white">
        kreativ<span className="text-volt">.ae</span>
      </div>
      <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.32em] text-zinc-500">
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
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const showBadge = item.href === "/conversas" && unread > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
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
                <item.icon
                  className={`relative h-4 w-4 ${active ? "text-volt" : "text-zinc-600 group-hover:text-zinc-400"}`}
                  strokeWidth={2}
                />
                <span className="relative">{item.label}</span>
                {showBadge && (
                  <span className="relative ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-volt px-1.5 text-[10.5px] font-bold tabular-nums text-onvolt">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-white/[0.06] px-3 py-4">
          <ThemeToggle />
          <Link
            href="/conta"
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
              pathname.startsWith("/conta") ? "text-white" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <UserRound className={`h-4 w-4 ${pathname.startsWith("/conta") ? "text-volt" : "text-zinc-600"}`} strokeWidth={2} />
            Conta
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
        <Wordmark />
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
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
        </nav>
      </header>

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

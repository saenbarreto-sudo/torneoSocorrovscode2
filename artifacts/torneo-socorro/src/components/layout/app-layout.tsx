import * as React from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { TorneoSocorroLogo } from "@/components/logo"
import { canAccessRoute, ROLE_LABELS, useAuth } from "@/lib/auth"
import { ModeToggle } from "@/components/mode-toggle"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  LayoutDashboard,
  Trophy,
  Users,
  Swords,
  Medal,
  Shield,
  Flag,
  CreditCard,
  CalendarDays,
  ShieldAlert,
  LogOut,
  Menu,
  UserCog,
  Wallet,
  Settings,
} from "lucide-react"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/posiciones", label: "Posiciones", icon: Trophy },
  { href: "/programacion", label: "Programación", icon: CalendarDays },
  { href: "/partidos", label: "Partidos & Resultados", icon: Swords },
  { href: "/equipos", label: "Equipos", icon: ShieldAlert },
  { href: "/jugadores", label: "Jugadores", icon: Users },
  { href: "/goleadores", label: "Goleadores", icon: Medal },
  { href: "/vallas", label: "Valla menos vencida", icon: Shield },
  { href: "/amonestados", label: "Amonestados", icon: Flag },
  { href: "/pagos", label: "Pagos & Multas", icon: CreditCard },
  { href: "/pagos/resumen", label: "Estado de Cuenta", icon: CreditCard },
  { href: "/egresos", label: "Egresos", icon: Wallet },
  { href: "/usuarios", label: "Usuarios", icon: UserCog },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
]

function NavLinks({
  items,
  location,
  onNavigate,
}: {
  items: typeof navItems
  location: string
  onNavigate?: () => void
}) {
  return (
    <>
      {items.map((item) => {
        const isActive = location === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { user, role, logout } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  const visibleNavItems = navItems.filter((item) => canAccessRoute(role, item.href))
  const sessionLabel = user ? user.nombre : ROLE_LABELS.publico

  // Cierra el menú móvil automáticamente al cambiar de página
  React.useEffect(() => {
    setMobileNavOpen(false)
  }, [location])

  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      {/* Sidebar (desktop / tablet) */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-col hidden md:flex shrink-0">
        <div className="p-6 flex items-center gap-3">
          <TorneoSocorroLogo className="h-11 w-14 shrink-0" />
          <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
            TORNEO SOCORRO
            <br />
            <span className="text-sidebar-foreground text-xs font-medium opacity-80">
              SENIOR MASTER PLUS 40
            </span>
          </h1>
        </div>

        <div className="mx-4 mb-3 px-3 py-2 rounded-md bg-sidebar-accent">
          <p className="text-[10px] uppercase tracking-wide text-sidebar-accent-foreground/70 font-bold">
            Sesión activa
          </p>
          <p className="text-sm font-semibold text-sidebar-accent-foreground">{sessionLabel}</p>
          <p className="text-xs text-sidebar-accent-foreground/70">{role ? ROLE_LABELS[role] : ""}</p>
        </div>

        <nav className="flex-1 px-4 pb-6 space-y-1 overflow-y-auto">
          <NavLinks items={visibleNavItems} location={location} />
        </nav>

        <ModeToggle showLabel className="mx-4 mb-1" />

        <button
          onClick={logout}
          className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>

        <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/50 text-center font-mono">
          V 1.0.0
        </div>
      </aside>

      {/* Menú de navegación móvil (drawer) */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-72 bg-sidebar text-sidebar-foreground border-sidebar-border p-0 flex flex-col"
        >
          <SheetHeader className="p-6 pb-3 text-left">
            <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
            <SheetDescription className="sr-only">
              Accede a las secciones del Torneo Socorro
            </SheetDescription>
            <div className="flex items-center gap-3">
              <TorneoSocorroLogo className="h-11 w-14 shrink-0" />
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                TORNEO SOCORRO
                <br />
                <span className="text-sidebar-foreground text-xs font-medium opacity-80">
                  SENIOR MASTER PLUS 40
                </span>
              </h1>
            </div>
          </SheetHeader>

          <div className="mx-4 mb-3 px-3 py-2 rounded-md bg-sidebar-accent">
            <p className="text-[10px] uppercase tracking-wide text-sidebar-accent-foreground/70 font-bold">
              Sesión activa
            </p>
            <p className="text-sm font-semibold text-sidebar-accent-foreground">{sessionLabel}</p>
            <p className="text-xs text-sidebar-accent-foreground/70">{role ? ROLE_LABELS[role] : ""}</p>
          </div>

          <nav className="flex-1 px-4 pb-6 space-y-1 overflow-y-auto">
            <NavLinks
              items={visibleNavItems}
              location={location}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </nav>

          <button
            onClick={logout}
            className="mx-4 mb-6 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden h-14 bg-sidebar flex items-center justify-between px-3 border-b border-sidebar-border shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
            className="p-2 -ml-2 rounded-md hover:bg-sidebar-accent text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <TorneoSocorroLogo className="h-8 w-11 shrink-0" />
            <h1 className="text-sm font-bold text-white truncate">TORNEO SOCORRO</h1>
          </div>
          <div className="flex items-center -mr-2">
            <ModeToggle />
            <button
              onClick={logout}
              aria-label="Cerrar sesión"
              className="p-2 rounded-md hover:bg-sidebar-accent"
            >
              <LogOut className="h-5 w-5 text-sidebar-foreground/80" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  )
}

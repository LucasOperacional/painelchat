import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Plus, Search } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TITULOS: Record<string, string> = {
  dashboard: "Dashboard",
  atendimento: "Caixa de entrada",
  kanban: "Kanban",
  contatos: "Contatos",
  filas: "Filas",
  departamentos: "Departamentos",
  equipe: "Equipe",
  processos: "Processos judiciais",
  chatbot: "Automações",
  divulgazap: "DivulgaZap",
  divulgacao: "Divulgação em grupos",
  chamadas: "Chamadas",
  ia: "IA",
  "das-mei": "DAS MEI",
  nfse: "Emissão de NFS-e",
  banco: "Banco",
  "sistema-api": "Portal da Transparência",
  cobrancas: "Cobranças e acessos",
  estoque: "Estoque de logins",
  consultas: "Consultas",
  webview: "Sites",
  whatsapp: "Dispositivos",
  "api-conexao": "API de conexão",
  monitoramento: "Monitoramento",
  franquias: "Franquias",
  relatorios: "Relatórios",
  backup: "Backup",
  configuracoes: "Configurações",
};

function rotular(segmento: string) {
  return (
    TITULOS[segmento] ||
    segmento.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const segmentos = pathname.split("/").filter(Boolean);
  const titulo = segmentos[0] ? rotular(segmentos[0]) : "Operação principal";

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "15.25rem",
          "--sidebar-width-icon": "3.25rem",
        } as React.CSSProperties
      }
    >
      <div className="flex min-h-svh w-full overflow-x-hidden bg-background">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md sm:gap-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {titulo}
                </p>
                <nav className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                  <span>Operação principal</span>
                  {segmentos.slice(0, 2).map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <ChevronRight className="size-3 shrink-0" />
                      <span className="truncate">{rotular(s)}</span>
                    </span>
                  ))}
                </nav>
              </div>
            </div>

            <div className="hidden min-w-0 justify-center md:flex">
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar conversas, contatos…"
                  className="h-9 rounded-xl border-border/70 bg-secondary/60 pl-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate({ to: "/atendimento" });
                  }}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <NotificationBell />
              <ThemeToggle variant="icon" />
              <Button
                asChild
                size="sm"
                className="h-9 rounded-xl bg-primary px-3 text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <Link to="/atendimento">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Novo atendimento</span>
                </Link>
              </Button>
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

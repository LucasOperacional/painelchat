import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Inbox,
  MessagesSquare,
  KanbanSquare,
  ListOrdered,
  Building2,
  Users,
  BarChart3,
  LogOut,
  Headset,
  Smartphone,
  Sparkles,
  Gavel,
  Contact,
  Receipt,
  PlugZap,
  LayoutGrid,
  Megaphone,
  Bot,
  PhoneCall,
   ChevronDown,
   DatabaseBackup,
    Settings,
    Landmark,
    Globe,
    FileCheck2,
    Wallet,
    Database,
    CalendarClock,
    Boxes,
    Activity,
    Images,
 } from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-session";
import { useProjectBranding } from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  label: string;
  icon: LucideIcon;
  adminOnly: boolean;
  to?: string;
  href?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutGrid, adminOnly: false },
    ],
  },
  {
    label: "Menu",
    items: [
      { to: "/atendimento", label: "Atendimento", icon: MessagesSquare, adminOnly: false },
      { to: "/kanban", label: "Kanban", icon: KanbanSquare, adminOnly: false },
      { to: "/contatos", label: "Contatos", icon: Contact, adminOnly: false },
      { to: "/filas", label: "Filas", icon: ListOrdered, adminOnly: true },
      { to: "/departamentos", label: "Departamentos", icon: Building2, adminOnly: true },
      { to: "/equipe", label: "Equipe", icon: Users, adminOnly: true },
    ],
  },
  {
    label: "Integrações",
    items: [
      { to: "/processos", label: "Processos judiciais", icon: Gavel, adminOnly: false },
      { to: "/chatbot", label: "Chatbot", icon: Bot, adminOnly: true },
      { to: "/divulgazap", label: "DivulgaZap", icon: Megaphone, adminOnly: true },
      { to: "/divulgacao", label: "Divulgação em grupos", icon: Users, adminOnly: true },
      { to: "/postagens", label: "Postagens e Stories", icon: CalendarClock, adminOnly: true },
      { to: "/stories", label: "Stories e canais", icon: Images, adminOnly: false },
      { to: "/chamadas", label: "Chamadas", icon: PhoneCall, adminOnly: false },
      { to: "/ia", label: "IA", icon: Sparkles, adminOnly: true },
    ],
  },
  {
    label: "Contabilidade",
    items: [
      { to: "/das-mei", label: "DAS MEI", icon: FileCheck2, adminOnly: false },
      { to: "/nfse", label: "Emissão de NFS-e", icon: Receipt, adminOnly: false },
    ],
  },
  {
    label: "Financeiro",
    items: [{ to: "/banco", label: "Banco", icon: Wallet, adminOnly: false }],
  },
  {
    label: "SISTEMA API",
    items: [
      { to: "/sistema-api", label: "Portal da Transparência", icon: Landmark, adminOnly: false },
    ],
  },
  {
    label: "Cobranças",
    items: [
      { to: "/cobrancas", label: "Cobranças e acessos", icon: CalendarClock, adminOnly: false },
      { to: "/estoque", label: "Estoque de logins", icon: Boxes, adminOnly: true },
    ],
  },
  {
    label: "CONSULTAS",
    items: [
      { to: "/consultas", label: "Consultas", icon: Database, adminOnly: false },
    ],
  },
  {
    label: "WEBVIEW",
    items: [{ to: "/webview", label: "Sites", icon: Globe, adminOnly: false }],
  },
  {
    label: "Administração",
    items: [
      { to: "/whatsapp", label: "Dispositivos", icon: Smartphone, adminOnly: true },
      { to: "/api-conexao", label: "API de conexão", icon: PlugZap, adminOnly: true },
      { to: "/monitoramento", label: "Monitoramento", icon: Activity, adminOnly: true },
      { to: "/sentinela", label: "IA Sentinela", icon: Bot, adminOnly: true },
      { to: "/mensagens-pendentes", label: "Mensagens pendentes", icon: Inbox, adminOnly: true },

      { to: "/franquias", label: "Franquias", icon: LayoutGrid, adminOnly: true },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, adminOnly: true },
      { to: "/backup", label: "Backup", icon: DatabaseBackup, adminOnly: true },
      { to: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
    ],
  },
];


export function AppSidebar() {
  const { profile, isAdmin } = useMe();
  const { project } = useProjectBranding();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();

  function closeMobileMenu() {
    if (isMobile) setOpenMobile(false);
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Integrações: true });

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-2">
        <Link to="/atendimento" onClick={closeMobileMenu} className="flex min-w-0 items-center gap-3 px-1 py-2">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground">
            {project?.logoUrl ? (
              <img src={project.logoUrl} alt={project.name} className="size-full object-contain p-0.5" />
            ) : (
              <Headset className="size-5" />
            )}
          </span>
          <div className="min-w-0 leading-tight group-data-[state=collapsed]:hidden">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {project?.name || "NXS Multi Atendimento"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{project?.tagline || "Central omnichannel"}</p>
          </div>
        </Link>
        <div className="mx-1 flex items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 group-data-[state=collapsed]:hidden">
          <span className="size-2 shrink-0 rounded-full bg-success" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ambiente</p>
            <p className="truncate text-xs font-medium text-sidebar-foreground">Operação principal</p>
          </div>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
      </SidebarHeader>


      <SidebarContent>
        {groups.map((group) => {
          const open = openGroups[group.label] ?? true;
          const groupActive = group.items.some((item) => item.to && pathname.startsWith(item.to));
          return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel asChild>
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((prev) => ({ ...prev, [group.label]: !open }))
                }
                className={cn(
                  "flex w-full items-center justify-between",
                  groupActive && "text-primary",
                )}
                aria-expanded={open}
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform group-data-[state=collapsed]:hidden",
                    !open && "-rotate-90",
                  )}
                />
              </button>
            </SidebarGroupLabel>
            {open && (
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.to!);
                  const content = (
                    <>
                      <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                      <span>{item.label}</span>
                    </>
                  );
                  const className = cn(
                    "relative flex items-center gap-2.5 rounded-xl transition-colors",
                    "before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary before:opacity-0 before:transition-opacity",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:opacity-100"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  );
                  return (
                    <SidebarMenuItem key={item.href || item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        {item.href ? (
                          <a href={item.href} className={className} onClick={closeMobileMenu}>
                            {content}
                          </a>
                        ) : (
                          <Link to={item.to!} className={className} onClick={closeMobileMenu}>
                            {content}
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
            )}
          </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border">
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-2 group-data-[state=collapsed]:hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {(profile?.full_name || "A").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-medium text-sidebar-foreground">
              {profile?.full_name || "Atendente"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {isAdmin ? "Administrador" : "Atendente"}
            </p>
          </div>
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              tooltip="Sair"
              className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

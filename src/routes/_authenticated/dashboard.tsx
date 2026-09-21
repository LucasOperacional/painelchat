import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MessagesSquare,
  Clock,
  Users,
  Headset,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

import {
  fetchConversations,
  fetchProfiles,
  fetchContacts,
  type Conversation,
} from "@/lib/central";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/contact-avatar";
import { useProjectBranding } from "@/hooks/use-project";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Central" },
      {
        name: "description",
        content: "Visão geral da central de multi atendimento.",
      },
      { property: "og:title", content: "Dashboard — Central" },
      { property: "og:description", content: "Visão geral da central de multi atendimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function formatRelative(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diff < 1) return "agora";
  if (diff < 60) return `há ${diff} min`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `há ${hours} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function DashboardPage() {
  const { project } = useProjectBranding();
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: fetchContacts });

  const all = conversations.data ?? [];
  const waiting = all.filter((c) => c.status === "waiting");
  const open = all.filter((c) => c.status === "open");
  const closedToday = all.filter((c) => {
    if (c.status !== "closed" || !c.closed_at) return false;
    const closed = new Date(c.closed_at);
    const today = new Date();
    return (
      closed.getDate() === today.getDate() &&
      closed.getMonth() === today.getMonth() &&
      closed.getFullYear() === today.getFullYear()
    );
  });

  const onlineAgents = useMemo(
    () => (profiles.data ?? []).filter((p) => p.status === "available").length,
    [profiles.data],
  );

  const chartData = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      buckets.set(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), 0);
    }
    for (const c of all) {
      const label = new Date(c.created_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([dia, total]) => ({ dia, total }));
  }, [all]);

  const recent = useMemo(() => {
    return [...all]
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
      .slice(0, 6);
  }, [all]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:space-y-6 sm:p-6">
      <header className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {project?.dashboardLogoUrl && (
            <img
              src={project.dashboardLogoUrl}
              alt={project.name}
              className="h-14 w-auto max-w-56 object-contain sm:h-16 sm:max-w-64"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Visão geral da central de atendimento.</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link to="/atendimento">
            Ir para atendimento
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <MetricCard
          label="Aguardando"
          value={String(waiting.length)}
          icon={Clock}
          description="conversas na fila"
        />
        <MetricCard
          label="Em atendimento"
          value={String(open.length)}
          icon={MessagesSquare}
          description="conversas abertas"
        />
        <MetricCard
          label="Contatos"
          value={String(contacts.data?.length ?? 0)}
          icon={Users}
          description="cadastrados"
        />
        <MetricCard
          label="Atendentes online"
          value={String(onlineAgents)}
          icon={Headset}
          description={`de ${profiles.data?.length ?? 0} cadastrados`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <TrendingUp className="size-4 text-primary" />
              Atendimentos nos últimos 7 dias
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4 sm:px-6 sm:pb-6">
            <div className="h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                    }}
                  />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Resumo do dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Encerrados hoje</span>
              <span className="text-lg font-semibold text-foreground">{closedToday.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total de conversas</span>
              <span className="text-lg font-semibold text-foreground">{all.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Atendentes disponíveis</span>
              <span className="text-lg font-semibold text-foreground">{onlineAgents}</span>
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/relatorios">Ver relatórios completos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base font-medium">Conversas recentes</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conversa recente.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((conversation) => (
                <ConversationItem key={conversation.id} conversation={conversation} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  description,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-28 flex-col items-start gap-2 p-3 sm:min-h-0 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-11">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConversationItem({ conversation }: { conversation: Conversation }) {
  const contact = conversation.contact;
  const agent = conversation.assigned_to
    ? (profiles: { id: string; full_name: string }[]) =>
        profiles.find((p) => p.id === conversation.assigned_to)?.full_name ?? "—"
    : null;

  return (
    <Link
      to="/atendimento"
      search={{ conversation: conversation.id }}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
    >
      <ContactAvatar name={contact?.name ?? "—"} avatarUrl={contact?.avatar_url ?? null} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-card-foreground">{contact?.name ?? "—"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {conversation.status === "waiting"
            ? "Aguardando na fila"
            : conversation.assigned_to
              ? `Atendente: ${agent?.([]) ?? "—"}`
              : "Em espera"}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatRelative(conversation.last_message_at)}
      </span>
    </Link>
  );
}

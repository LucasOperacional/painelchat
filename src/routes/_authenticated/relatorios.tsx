import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  fetchConversations,
  fetchDepartments,
  fetchProfiles,
  fetchQueues,
  type Conversation,
} from "@/lib/central";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de atendimento — Central" },
      {
        name: "description",
        content:
          "Acompanhe volume de atendimentos, tempo médio de resposta e desempenho por atendente, fila e departamento.",
      },
      { property: "og:title", content: "Relatórios de atendimento — Central" },
      { property: "og:description", content: "Indicadores da central de multi atendimento." },
    ],
  }),
  component: RelatoriosPage,
});

function minutesBetween(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function formatMinutes(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toFixed(1)} h`;
}

function RelatoriosPage() {
  const [days, setDays] = useState("30");
  const conversations = useQuery({ queryKey: ["conversations"], queryFn: fetchConversations });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const queues = useQuery({ queryKey: ["queues"], queryFn: fetchQueues });
  const departments = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments });

  const period = useMemo(() => {
    const limit = Date.now() - Number(days) * 86400000;
    return (conversations.data ?? []).filter((c) => new Date(c.created_at).getTime() >= limit);
  }, [conversations.data, days]);

  const waiting = (conversations.data ?? []).filter((c) => c.status === "waiting").length;

  const firstResponse = average(
    period
      .filter((c) => c.first_response_at)
      .map((c) => minutesBetween(c.created_at, c.first_response_at!)),
  );
  const resolution = average(
    period.filter((c) => c.closed_at).map((c) => minutesBetween(c.created_at, c.closed_at!)),
  );

  const countBy = (items: Conversation[], key: (c: Conversation) => string | null) => {
    const map = new Map<string, number>();
    for (const item of items) {
      const k = key(item) ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  const byAgent = countBy(
    period,
    (c) => (profiles.data ?? []).find((p) => p.id === c.assigned_to)?.full_name ?? "Sem responsável",
  );
  const byQueue = countBy(
    period,
    (c) => (queues.data ?? []).find((q) => q.id === c.queue_id)?.name ?? "Sem fila",
  );
  const byDept = countBy(
    period,
    (c) => (departments.data ?? []).find((d) => d.id === c.department_id)?.name ?? "Sem departamento",
  );

  const chartData = useMemo(() => {
    const buckets = new Map<string, number>();
    const n = Number(days);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      buckets.set(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), 0);
    }
    for (const c of period) {
      const label = new Date(c.created_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([dia, total]) => ({ dia, total }));
  }, [period, days]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:space-y-6 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Desempenho da central de atendimento.</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Atendimentos no período" value={String(period.length)} />
        <Metric label="Aguardando agora" value={String(waiting)} />
        <Metric label="1ª resposta (média)" value={formatMinutes(firstResponse)} />
        <Metric label="Encerramento (média)" value={formatMinutes(resolution)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-4 text-sm font-medium text-card-foreground">Atendimentos por dia</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="dia" fontSize={11} stroke="var(--color-muted-foreground)" />
              <YAxis allowDecimals={false} fontSize={11} stroke="var(--color-muted-foreground)" />
              <Tooltip />
              <Bar dataKey="total" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard title="Por atendente" rows={byAgent} />
        <RankCard title="Por fila" rows={byQueue} />
        <RankCard title="Por departamento" rows={byDept} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function RankCard({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="mb-3 text-sm font-medium text-card-foreground">{title}</p>
      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-sm text-muted-foreground">Sem dados.</li>}
        {rows.map(([label, total]) => (
          <li key={label} className="flex justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

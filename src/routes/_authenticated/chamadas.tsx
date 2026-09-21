import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Search,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { getWavoipCallLink, listWavoipCalls } from "@/lib/wavoip.functions";
import { formatBrPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/chamadas")({
  head: () => ({
    meta: [
      { title: "Chamadas — Central de Atendimento" },
      {
        name: "description",
        content:
          "Histórico das ligações de WhatsApp feitas e recebidas pela Wavoip, com duração e resultado.",
      },
      { property: "og:title", content: "Chamadas — Central de Atendimento" },
      {
        property: "og:description",
        content: "Ligações de WhatsApp feitas e recebidas, com duração e resultado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChamadasPage,
});

const STATUS_LABELS: Record<string, string> = {
  ENDED: "Atendida",
  ACTIVE: "Em andamento",
  RINGING: "Tocando",
  CALLING: "Chamando",
  NOT_ANSWERED: "Não atendida",
  REJECTED: "Recusada",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
  DISCONNECTED: "Desconectada",
  ACCEPTED_ELSEWHERE: "Atendida em outro aparelho",
  REJECTED_ELSEWHERE: "Recusada em outro aparelho",
  DEVICE_RESTARTING: "Aparelho reiniciando",
  NONE: "Sem status",
};

const REASON_LABELS: Record<string, string> = {
  "callee:no-answer": "Tocou e ninguém atendeu",
  "callee:unreached": "O telefone não chegou a tocar",
  "callee:blocked": "O WhatsApp não entregou a chamada",
  "integration:call-limit": "Limite diário de chamadas atingido",
  "integration:already-in-call": "Já havia uma ligação em andamento",
  "integration:invalid-number": "Número inválido",
  "integration:forbidden": "O contato não autorizou receber chamadas",
  "ack-error:463": "Conta do WhatsApp restrita para chamadas",
  "device:restarted": "O aparelho reiniciou durante a ligação",
  "internal:error": "Falha interna",
};

function duration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

function ChamadasPage() {
  const listFn = useServerFn(listWavoipCalls);
  const linkFn = useServerFn(getWavoipCallLink);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "INCOMING" | "OUTCOMING">("");
  const [dialPhone, setDialPhone] = useState("");

  const calls = useQuery({
    queryKey: ["wavoip-calls", search, direction],
    queryFn: () => listFn({ data: { search, direction, count: 50, cursor: "" } }),
    retry: false,
  });

  const dial = useMutation({
    mutationFn: (phone: string) => linkFn({ data: { phone, name: "" } }),
    onSuccess: (res) => {
      window.open(res.url, "wavoip", "width=380,height=620");
    },
    onError: (error: Error) =>
      toast.error("Não foi possível iniciar a ligação", { description: error.message }),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chamadas</h1>
          <p className="text-sm text-muted-foreground">
            Ligações de WhatsApp feitas e recebidas pela sua conta Wavoip.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-9 w-44"
            inputMode="numeric"
            placeholder="55629..."
            value={dialPhone}
            onChange={(e) => setDialPhone(e.target.value)}
          />
          <Button
            size="sm"
            disabled={dialPhone.replace(/\D/g, "").length < 10 || dial.isPending}
            onClick={() => dial.mutate(dialPhone)}
          >
            {dial.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <PhoneCall className="mr-1.5 size-4" />
            )}
            Ligar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Histórico</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-56 pl-8"
                placeholder="Buscar por número"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={direction || "all"}
              onValueChange={(v) =>
                setDirection(v === "all" ? "" : (v as "INCOMING" | "OUTCOMING"))
              }
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="OUTCOMING">Feitas</SelectItem>
                <SelectItem value="INCOMING">Recebidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {calls.isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando chamadas…</p>
          )}
          {calls.isError && (
            <p className="py-6 text-center text-sm text-destructive">
              {(calls.error as Error).message}
            </p>
          )}
          {calls.data && calls.data.calls.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {calls.data.notice || "Nenhuma chamada encontrada."}
            </p>
          )}
          <div className="divide-y divide-border">
            {(calls.data?.calls ?? []).map((c) => {
              const incoming = c.direction === "INCOMING";
              const other = incoming ? c.caller : c.receiver;
              const missed = !c.duration;
              return (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  {missed ? (
                    <PhoneMissed className="size-4 shrink-0 text-destructive" />
                  ) : incoming ? (
                    <PhoneIncoming className="size-4 shrink-0 text-primary" />
                  ) : (
                    <PhoneOutgoing className="size-4 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {other ? formatBrPhone(other) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.created_date).toLocaleString("pt-BR")} ·{" "}
                      {incoming ? "recebida" : "feita"} · {duration(c.duration)}
                      {c.reason ? ` · ${REASON_LABELS[c.reason] ?? c.reason}` : ""}
                    </p>
                  </div>
                  <Badge variant={missed ? "outline" : "secondary"}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                  {other && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Ligar de volta"
                      onClick={() => dial.mutate(other)}
                    >
                      <PhoneCall className="size-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Gavel, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { buscarProcesso, listarTribunais } from "@/lib/processos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/processos")({
  head: () => ({
    meta: [
      { title: "Processos judiciais — Central" },
      {
        name: "description",
        content:
          "Consulte processos judiciais de todos os tribunais do Brasil usando a base pública do CNJ direto da central de atendimento.",
      },
      { property: "og:title", content: "Processos judiciais — Central" },
      {
        property: "og:description",
        content: "Busque um processo pelo número e veja classe, órgão julgador e movimentações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProcessosPage,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function ProcessosPage() {
  const fetchTribunais = useServerFn(listarTribunais);
  const fetchProcesso = useServerFn(buscarProcesso);

  const [tribunal, setTribunal] = useState("TJSP");
  const [processo, setProcesso] = useState("");

  const tribunais = useQuery({
    queryKey: ["tribunais"],
    queryFn: () => fetchTribunais(),
    staleTime: Infinity,
  });

  const busca = useMutation({
    mutationFn: () => fetchProcesso({ data: { tribunal, processo } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const resultado = busca.data;

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-6">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gavel className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Processos judiciais</h1>
          <p className="text-sm text-muted-foreground">
            Consulta na base pública do CNJ (DataJud) por número de processo.
          </p>
        </div>
      </header>

      <form
        className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,240px)_1fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const digitos = processo.replace(/\D/g, "");
          if (digitos.length !== 20) {
            toast.error(
              `Número incompleto: ${digitos.length} de 20 dígitos. Use o formato 0000000-00.0000.0.00.0000.`,
            );
            return;
          }
          busca.mutate();
        }}
      >
        <div className="space-y-2">
          <Label>Tribunal</Label>
          <Select value={tribunal} onValueChange={setTribunal}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(tribunais.data ?? []).map((t) => (
                <SelectItem key={t.sigla} value={t.sigla}>
                  {t.sigla} — {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="processo">Número do processo</Label>
          <Input
            id="processo"
            value={processo}
            onChange={(e) => setProcesso(e.target.value)}
            placeholder="0000000-00.0000.0.00.0000"
            inputMode="numeric"
          />
        </div>

        <Button type="submit" className="w-full md:w-auto" disabled={busca.isPending}>
          {busca.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Buscar
        </Button>
      </form>

      {resultado && (
        <section className="space-y-4">
          <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Número" value={resultado.numeroProcesso} />
            <Info label="Tribunal" value={resultado.tribunal ?? "—"} />
            <Info label="Grau" value={resultado.grau ?? "—"} />
            <Info label="Classe" value={resultado.classeProcessual ?? "—"} />
            <Info label="Órgão julgador" value={resultado.orgaoJulgador ?? "—"} />
            <Info label="Sistema" value={resultado.sistemaProcessual ?? "—"} />
            <Info label="Formato" value={resultado.formatoProcesso ?? "—"} />
            <Info label="Ajuizamento" value={formatDate(resultado.dataAjuizamento)} />
            <Info label="Última atualização" value={formatDate(resultado.ultimaAtualizacao)} />
          </div>

          {resultado.assuntos.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-sm font-medium">Assuntos</p>
              <div className="flex flex-wrap gap-2">
                {resultado.assuntos.map((a) => (
                  <Badge key={`${a.codigo}-${a.nome}`} variant="secondary">
                    {a.nome}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-sm font-medium">
              Movimentações ({resultado.movimentos.length})
            </p>
            <ol className="space-y-3">
              {resultado.movimentos.map((m, i) => (
                <li key={`${i}-${m.nome}`} className="border-l-2 border-primary/40 pl-3">
                  <p className="text-sm font-medium">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(m.dataHora)}</p>
                  {m.complemento && (
                    <p className="text-xs text-muted-foreground">{m.complemento}</p>
                  )}
                </li>
              ))}
              {resultado.movimentos.length === 0 && (
                <li className="text-sm text-muted-foreground">Sem movimentações registradas.</li>
              )}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">{value}</p>
    </div>
  );
}

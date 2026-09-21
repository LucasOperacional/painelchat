import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BadgeCheck, Landmark, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  consultarBeneficios,
  pertenceEspecie,
  pertenceEspecie87,
  statusBeneficios,
} from "@/lib/beneficios.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/beneficios")({
  head: () => ({
    meta: [
      { title: "Benefícios previdenciários — Central" },
      {
        name: "description",
        content:
          "Consulte benefícios previdenciários por CPF direto da central, com dados oficiais do INSS via gov.br Conecta.",
      },
      { property: "og:title", content: "Benefícios previdenciários — Central" },
      {
        property: "og:description",
        content: "Pesquise benefícios por CPF, espécie e situação sem sair do atendimento.",
      },
    ],
  }),
  component: BeneficiosPage,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function digits(v: string) {
  return v.replace(/\D/g, "");
}

function BeneficiosPage() {
  const fetchStatus = useServerFn(statusBeneficios);
  const fetchLista = useServerFn(consultarBeneficios);
  const fetchPertence = useServerFn(pertenceEspecie);
  const fetchLoas = useServerFn(pertenceEspecie87);

  const [cpf, setCpf] = useState("");
  const [especie, setEspecie] = useState("");
  const [situacao, setSituacao] = useState("");
  const [especieCheck, setEspecieCheck] = useState("");

  const status = useQuery({
    queryKey: ["beneficios-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
  });

  const lista = useMutation({
    mutationFn: () => fetchLista({ data: { cpf, especie, situacao } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const pertence = useMutation({
    mutationFn: () => fetchPertence({ data: { cpf, especie: especieCheck } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const loas = useMutation({
    mutationFn: () => fetchLoas({ data: { cpf } }),
    onError: (e: Error) => toast.error(e.message),
  });

  function validaCpf() {
    if (digits(cpf).length !== 11) {
      toast.error(`CPF incompleto: ${digits(cpf).length} de 11 dígitos.`);
      return false;
    }
    return true;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Landmark className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Benefícios previdenciários</h1>
          <p className="text-sm text-muted-foreground">
            Consulta oficial de benefícios do INSS por CPF (gov.br Conecta).
          </p>
        </div>
      </header>

      {status.data && !status.data.configurado && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          A consulta ainda não está liberada: falta cadastrar o acesso do gov.br Conecta (client id e
          client secret). Envie-os e eu ativo a pesquisa.
        </div>
      )}

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
        </div>
      </div>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Pesquisar benefícios</TabsTrigger>
          <TabsTrigger value="especie">Pertence à espécie</TabsTrigger>
          <TabsTrigger value="loas">LOAS 87</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <form
            className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (validaCpf()) lista.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="especie">Espécie (opcional)</Label>
              <Input
                id="especie"
                value={especie}
                onChange={(e) => setEspecie(e.target.value)}
                placeholder="ex.: 87"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="situacao">Situação (opcional)</Label>
              <Input
                id="situacao"
                value={situacao}
                onChange={(e) => setSituacao(e.target.value)}
                placeholder="ex.: 0"
                inputMode="numeric"
              />
            </div>
            <Button type="submit" disabled={lista.isPending}>
              {lista.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Consultar
            </Button>
          </form>

          {lista.data && (
            <div className="space-y-4">
              {lista.data.beneficios.length === 0 && (
                <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                  Nenhum benefício encontrado para esse CPF.
                </p>
              )}
              {lista.data.beneficios.map((b, i) => (
                <div
                  key={`${b.numeroBeneficio ?? i}`}
                  className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <Info label="Número do benefício" value={b.numeroBeneficio?.toString() ?? "—"} />
                  <Info label="Titular" value={b.nomeTitular ?? "—"} />
                  <Info label="Nome da mãe" value={b.nomeMaeTitular ?? "—"} />
                  <Info label="Gênero" value={b.genero ?? "—"} />
                  <Info label="Nascimento" value={formatDate(b.dataNascimento)} />
                  <Info label="Início" value={formatDate(b.dataInicioBeneficio)} />
                  <Info label="Cessação" value={formatDate(b.dataCessacaoBeneficio)} />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Situação</p>
                    <Badge variant="secondary">
                      {b.descricaoSituacaoBeneficio ?? b.codigoSituacaoBeneficio ?? "—"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Espécie</p>
                    <Badge variant="secondary">
                      {b.descricaoEspecieBeneficio ?? b.codigoEspecieBeneficio ?? "—"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="especie" className="space-y-4">
          <form
            className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!digits(especieCheck)) {
                toast.error("Informe o código da espécie.");
                return;
              }
              if (validaCpf()) pertence.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="especie-check">Código da espécie</Label>
              <Input
                id="especie-check"
                value={especieCheck}
                onChange={(e) => setEspecieCheck(e.target.value)}
                placeholder="ex.: 41"
                inputMode="numeric"
              />
            </div>
            <Button type="submit" disabled={pertence.isPending}>
              {pertence.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Verificar
            </Button>
          </form>
          {pertence.data && (
            <p className="rounded-xl border bg-card p-4 text-sm">
              {pertence.data.pertence
                ? "Sim — existe benefício dessa espécie para o CPF informado."
                : "Não — nenhum benefício dessa espécie para o CPF informado."}
            </p>
          )}
        </TabsContent>

        <TabsContent value="loas" className="space-y-4">
          <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Verifica se o CPF possui benefício ativo de LOAS 87 (amparo social à pessoa com
              deficiência).
            </p>
            <Button
              onClick={() => {
                if (validaCpf()) loas.mutate();
              }}
              disabled={loas.isPending}
            >
              {loas.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Verificar
            </Button>
          </div>
          {loas.data && (
            <p className="rounded-xl border bg-card p-4 text-sm">
              {loas.data.pertence
                ? "Sim — possui LOAS 87 ativo."
                : "Não — sem LOAS 87 ativo para esse CPF."}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

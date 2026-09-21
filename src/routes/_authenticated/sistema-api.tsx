import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Landmark, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  consultarTransparencia,
  statusTransparencia,
  type ConsultaResultado,
  type ConsultaTipo,
} from "@/lib/transparencia.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  consultarPrevidencia,
  statusPrevidencia,
  type PrevidenciaResultado,
  type PrevidenciaTipo,
} from "@/lib/previdencia.functions";

export const Route = createFileRoute("/_authenticated/sistema-api")({
  head: () => ({
    meta: [
      { title: "Portal da Transparência — Central" },
      {
        name: "description",
        content:
          "Consulte sanções por CNPJ, benefícios por CPF, licitações e contratos do governo federal usando a API oficial do Portal da Transparência.",
      },
      { property: "og:title", content: "Portal da Transparência — Central" },
      {
        property: "og:description",
        content: "Consultas oficiais de empresas, pessoas e contratos públicos direto da central.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SistemaApiPage,
});

type ConsultaDef = {
  tipo: ConsultaTipo;
  titulo: string;
  descricao: string;
  documentoLabel?: string;
  documentoPlaceholder?: string;
  nomeLabel?: string;
  anoMes?: boolean;
  periodo?: boolean;
};

const GRUPOS: Record<string, ConsultaDef[]> = {
  empresas: [
    {
      tipo: "ceis",
      titulo: "CEIS — empresas inidôneas e suspensas",
      descricao: "Sanções que impedem a empresa de contratar com a administração pública.",
      documentoLabel: "CNPJ ou CPF do sancionado",
      documentoPlaceholder: "00.000.000/0000-00",
    },
    {
      tipo: "cnep",
      titulo: "CNEP — empresas punidas",
      descricao: "Cadastro Nacional de Empresas Punidas pela Lei Anticorrupção.",
      documentoLabel: "CNPJ ou CPF do sancionado",
      documentoPlaceholder: "00.000.000/0000-00",
    },
    {
      tipo: "cepim",
      titulo: "CEPIM — entidades sem fins lucrativos impedidas",
      descricao: "Entidades impedidas de firmar convênios com o governo federal.",
      documentoLabel: "CNPJ da entidade",
      documentoPlaceholder: "00.000.000/0000-00",
    },
    {
      tipo: "fornecedores",
      titulo: "Fornecedores do governo",
      descricao: "Empresas que fornecem para o governo federal.",
      documentoLabel: "CNPJ (opcional)",
      nomeLabel: "Nome do fornecedor (opcional)",
    },
  ],
  pessoas: [
    {
      tipo: "bolsa-familia",
      titulo: "Bolsa Família / Auxílio",
      descricao: "Pagamentos por NIS ou CPF em uma competência específica.",
      documentoLabel: "NIS ou CPF",
      documentoPlaceholder: "00000000000",
      anoMes: true,
    },
    {
      tipo: "servidores",
      titulo: "Servidores públicos federais",
      descricao: "Consulta de servidores por CPF ou nome.",
      documentoLabel: "CPF (opcional)",
      nomeLabel: "Nome do servidor (opcional)",
    },
  ],
  contratos: [
    {
      tipo: "licitacoes",
      titulo: "Licitações",
      descricao: "Licitações do governo federal por período e órgão.",
      documentoLabel: "Código do órgão (opcional)",
      periodo: true,
    },
    {
      tipo: "contratos",
      titulo: "Contratos",
      descricao: "Contratos firmados pelo governo federal por período e órgão.",
      documentoLabel: "Código do órgão (opcional)",
      periodo: true,
    },
  ],
};

function formatLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function ResultCard({ item }: { item: Record<string, string> }) {
  const entries = Object.entries(item);
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{formatLabel(key.split(".").pop() ?? key)}</dt>
            <dd className="truncate text-sm text-foreground" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function ConsultaCard({ def }: { def: ConsultaDef }) {
  const consultar = useServerFn(consultarTransparencia);
  const [documento, setDocumento] = useState("");
  const [nome, setNome] = useState("");
  const [anoMes, setAnoMes] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [pagina, setPagina] = useState(1);

  const busca = useMutation({
    mutationFn: (page: number): Promise<ConsultaResultado> =>
      consultar({
        data: {
          tipo: def.tipo,
          documento: documento || undefined,
          nome: nome || undefined,
          anoMes: anoMes || undefined,
          dataInicial: dataInicial ? dataInicial.split("-").reverse().join("/") : undefined,
          dataFinal: dataFinal ? dataFinal.split("-").reverse().join("/") : undefined,
          pagina: page,
        },
      }) as Promise<ConsultaResultado>,
    onSuccess: (res) => {
      setPagina(res.pagina);
      if (res.erro) {
        toast.error("Consulta não realizada", { description: res.erro });
        return;
      }
      if (res.total === 0) toast.info("Nenhum registro encontrado para esta consulta.");
    },
    onError: (e: Error) => toast.error("Consulta não realizada", { description: e.message }),
  });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{def.titulo}</h2>
        <p className="text-xs text-muted-foreground">{def.descricao}</p>
      </div>

      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          busca.mutate(1);
        }}
      >
        {def.documentoLabel && (
          <div className="space-y-1.5">
            <Label htmlFor={`${def.tipo}-doc`}>{def.documentoLabel}</Label>
            <Input
              id={`${def.tipo}-doc`}
              value={documento}
              placeholder={def.documentoPlaceholder}
              onChange={(e) => setDocumento(e.target.value)}
            />
          </div>
        )}
        {def.nomeLabel && (
          <div className="space-y-1.5">
            <Label htmlFor={`${def.tipo}-nome`}>{def.nomeLabel}</Label>
            <Input id={`${def.tipo}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
        )}
        {def.anoMes && (
          <div className="space-y-1.5">
            <Label htmlFor={`${def.tipo}-anomes`}>Competência (AAAAMM)</Label>
            <Input
              id={`${def.tipo}-anomes`}
              value={anoMes}
              placeholder="202601"
              inputMode="numeric"
              onChange={(e) => setAnoMes(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
        )}
        {def.periodo && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${def.tipo}-ini`}>Data inicial</Label>
              <Input
                id={`${def.tipo}-ini`}
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${def.tipo}-fim`}>Data final</Label>
              <Input
                id={`${def.tipo}-fim`}
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <Button type="submit" disabled={busca.isPending}>
            {busca.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Search className="mr-1.5 size-4" />
            )}
            Consultar
          </Button>
        </div>
      </form>

      {busca.data && !busca.data.erro && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {busca.data.total} registro(s) — página {pagina}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1 || busca.isPending}
                onClick={() => busca.mutate(pagina - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busca.data.total === 0 || busca.isPending}
                onClick={() => busca.mutate(pagina + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
          <ul className="space-y-3">
            {busca.data.itens.map((item, i) => (
              <ResultCard key={i} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type PrevidenciaDef = {
  tipo: PrevidenciaTipo;
  titulo: string;
  descricao: string;
  especie?: "opcional" | "obrigatoria";
  situacao?: boolean;
};

const PREVIDENCIA: PrevidenciaDef[] = [
  {
    tipo: "beneficios",
    titulo: "Benefícios do CPF",
    descricao: "Lista os benefícios previdenciários vinculados ao CPF informado.",
    especie: "opcional",
    situacao: true,
  },
  {
    tipo: "pertence-especie",
    titulo: "Pertence a uma espécie",
    descricao: "Verifica se o CPF possui benefício da espécie informada.",
    especie: "obrigatoria",
    situacao: true,
  },
  {
    tipo: "pertence-especie-87",
    titulo: "LOAS 87 (BPC) ativo",
    descricao: "Confirma se o CPF possui benefício ativo do tipo LOAS 87.",
  },
];

function PrevidenciaCard({ def }: { def: PrevidenciaDef }) {
  const consultar = useServerFn(consultarPrevidencia);
  const [cpf, setCpf] = useState("");
  const [especie, setEspecie] = useState("");
  const [situacao, setSituacao] = useState("");

  const busca = useMutation({
    mutationFn: (): Promise<PrevidenciaResultado> =>
      consultar({
        data: {
          tipo: def.tipo,
          cpf,
          especie: especie || undefined,
          situacao: situacao || undefined,
        },
      }) as Promise<PrevidenciaResultado>,
    onSuccess: (res) => {
      if (res.erro) {
        toast.error("Consulta não realizada", { description: res.erro });
        return;
      }
      if (res.total === 0) toast.info("Nenhum registro encontrado para esta consulta.");
    },
    onError: (e: Error) => toast.error("Consulta não realizada", { description: e.message }),
  });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{def.titulo}</h2>
        <p className="text-xs text-muted-foreground">{def.descricao}</p>
      </div>

      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          busca.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`prev-${def.tipo}-cpf`}>CPF</Label>
          <Input
            id={`prev-${def.tipo}-cpf`}
            value={cpf}
            placeholder="000.000.000-00"
            inputMode="numeric"
            onChange={(e) => setCpf(e.target.value)}
          />
        </div>
        {def.especie && (
          <div className="space-y-1.5">
            <Label htmlFor={`prev-${def.tipo}-especie`}>
              Código da espécie {def.especie === "opcional" ? "(opcional)" : ""}
            </Label>
            <Input
              id={`prev-${def.tipo}-especie`}
              value={especie}
              placeholder="41"
              inputMode="numeric"
              onChange={(e) => setEspecie(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        )}
        {def.situacao && (
          <div className="space-y-1.5">
            <Label htmlFor={`prev-${def.tipo}-situacao`}>Código da situação (opcional)</Label>
            <Input
              id={`prev-${def.tipo}-situacao`}
              value={situacao}
              placeholder="00"
              inputMode="numeric"
              onChange={(e) => setSituacao(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        )}

        <div className="md:col-span-2">
          <Button type="submit" disabled={busca.isPending}>
            {busca.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Search className="mr-1.5 size-4" />
            )}
            Consultar
          </Button>
        </div>
      </form>

      {busca.data && !busca.data.erro && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{busca.data.total} registro(s)</p>
          <ul className="space-y-3">
            {busca.data.itens.map((item, i) => (
              <ResultCard key={i} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SistemaApiPage() {
  const statusFn = useServerFn(statusTransparencia);
  const status = useQuery({ queryKey: ["transparencia-status"], queryFn: () => statusFn({}) });
  const statusPrevFn = useServerFn(statusPrevidencia);
  const statusPrev = useQuery({
    queryKey: ["previdencia-status"],
    queryFn: () => statusPrevFn({}),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Landmark className="size-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Portal da Transparência</h1>
          <p className="text-sm text-muted-foreground">
            Consultas oficiais do governo federal: sanções por CNPJ, benefícios por CPF, licitações e
            contratos.
          </p>
        </div>
        <Badge variant={status.data?.configurado ? "default" : "secondary"}>
          {status.data?.configurado ? "Chave ativa" : "Sem chave"}
        </Badge>
      </header>

      {status.data && !status.data.configurado && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          A chave de acesso do Portal da Transparência ainda não está cadastrada. Sem ela, as
          consultas não retornam resultados.
        </p>
      )}

      <Tabs defaultValue="empresas">
        <TabsList>
          <TabsTrigger value="empresas">Empresas (CNPJ)</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas (CPF)</TabsTrigger>
          <TabsTrigger value="contratos">Licitações e contratos</TabsTrigger>
          <TabsTrigger value="previdencia">Benefícios (INSS)</TabsTrigger>
        </TabsList>
        {Object.entries(GRUPOS).map(([key, defs]) => (
          <TabsContent key={key} value={key} className="space-y-4">
            {defs.map((def) => (
              <ConsultaCard key={def.tipo} def={def} />
            ))}
          </TabsContent>
        ))}
        <TabsContent value="previdencia" className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Benefícios Previdenciários</h2>
              <p className="text-xs text-muted-foreground">
                Serviço oficial do Conecta gov.br (INSS) para consultar benefícios a partir do CPF.
              </p>
            </div>
            <Badge variant={statusPrev.data?.configurado ? "default" : "secondary"}>
              {statusPrev.data?.configurado ? "Credenciais ativas" : "Sem credenciais"}
            </Badge>
          </div>
          {statusPrev.data && !statusPrev.data.configurado && (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              As credenciais do Conecta gov.br ainda não estão cadastradas. Sem elas, as consultas de
              benefícios não retornam resultados.
            </p>
          )}
          {PREVIDENCIA.map((def) => (
            <PrevidenciaCard key={def.tipo} def={def} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

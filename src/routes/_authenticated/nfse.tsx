import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Plug,
  RefreshCcw,
  Repeat,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  nfseCancelar,
  nfseConfig,
  nfseConsultar,
  nfseConsultarUrl,
  nfseEmitir,
  nfseListar,
  nfseReenviar,
  nfseSalvarConfig,
  nfseTestarConexao,
  nfseXml,
  type NotaLinha,
} from "@/lib/nfse-goiania.functions";
import { formatarDocumento, validarDocumento } from "@/services/nfse/doc";

export const Route = createFileRoute("/_authenticated/nfse")({
  head: () => ({
    meta: [
      { title: "Emissão de NFS-e — Goiânia" },
      {
        name: "description",
        content:
          "Emita Nota Fiscal de Serviço Eletrônica de Goiânia direto no sistema, com histórico e cancelamento.",
      },
      { property: "og:title", content: "Emissão de NFS-e — Goiânia" },
      {
        property: "og:description",
        content: "Emissão, consulta e cancelamento de NFS-e de Goiânia pelo WebService oficial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NfsePage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusCor: Record<string, string> = {
  AUTORIZADA: "bg-emerald-500/15 text-emerald-600",
  REJEITADA: "bg-destructive/15 text-destructive",
  CANCELADA: "bg-muted text-muted-foreground",
  SUBSTITUIDA: "bg-amber-500/15 text-amber-600",
  PROCESSANDO: "bg-sky-500/15 text-sky-600",
  RASCUNHO: "bg-muted text-muted-foreground",
};

type Tomador = {
  cpfCnpj: string;
  nome: string;
  email: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  codigoMunicipio: string;
  uf: string;
};

const tomadorVazio: Tomador = {
  cpfCnpj: "",
  nome: "",
  email: "",
  telefone: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "Goiânia",
  codigoMunicipio: "5208707",
  uf: "GO",
};

type Servico = {
  competencia: string;
  itemListaServico: string;
  cnae: string;
  codigoTributacaoMunicipio: string;
  discriminacao: string;
  codigoMunicipioPrestacao: string;
  valorServicos: string;
  descontoIncondicionado: string;
  deducoes: string;
  aliquota: string;
  issRetido: boolean;
  pis: string;
  cofins: string;
  inss: string;
  ir: string;
  csll: string;
};

const servicoVazio: Servico = {
  competencia: new Date().toISOString().slice(0, 10),
  itemListaServico: "",
  cnae: "",
  codigoTributacaoMunicipio: "",
  discriminacao: "",
  codigoMunicipioPrestacao: "5208707",
  valorServicos: "",
  descontoIncondicionado: "0",
  deducoes: "0",
  aliquota: "5",
  issRetido: false,
  pis: "0",
  cofins: "0",
  inss: "0",
  ir: "0",
  csll: "0",
};

const n = (v: string) => Number(String(v).replace(",", ".")) || 0;

function NfsePage() {
  const queryClient = useQueryClient();
  const [aba, setAba] = useState("emitir");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Emissão de NFS-e</h1>
        <p className="text-sm text-muted-foreground">
          Goiânia/GO · padrão ABRASF 2.04 · comunicação direta com o sistema da prefeitura.
        </p>
      </header>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="emitir">Emitir</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="emitir" className="mt-4">
          <FormEmissao
            onEmitida={() => queryClient.invalidateQueries({ queryKey: ["nfse-notas"] })}
          />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <Historico />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <Configuracoes />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FormEmissao({ onEmitida }: { onEmitida: () => void }) {
  const cfg = useQuery({ queryKey: ["nfse-config"], queryFn: () => nfseConfig() });
  const [tomador, setTomador] = useState<Tomador>(tomadorVazio);
  const [servico, setServico] = useState<Servico>(servicoVazio);
  const [resultado, setResultado] = useState<
    (Awaited<ReturnType<typeof nfseEmitir>> & { rpsNumero?: number }) | null
  >(null);

  const emitirFn = useServerFn(nfseEmitir);
  const reenviarFn = useServerFn(nfseReenviar);
  const urlFn = useServerFn(nfseConsultarUrl);
  const xmlFn = useServerFn(nfseXml);

  const calculo = useMemo(() => {
    const bruto = n(servico.valorServicos);
    const base = Math.max(0, bruto - n(servico.deducoes) - n(servico.descontoIncondicionado));
    const iss = +(base * (n(servico.aliquota) / 100)).toFixed(2);
    const retencoes =
      n(servico.pis) + n(servico.cofins) + n(servico.inss) + n(servico.ir) + n(servico.csll);
    const liquido = +(bruto - retencoes - (servico.issRetido ? iss : 0)).toFixed(2);
    return { base: +base.toFixed(2), iss, retencoes: +retencoes.toFixed(2), liquido };
  }, [servico]);

  const emitir = useMutation({
    mutationFn: async () => {
      if (!validarDocumento(tomador.cpfCnpj)) throw new Error("CPF/CNPJ do tomador inválido.");
      if (!tomador.nome.trim()) throw new Error("Informe o nome do tomador.");
      if (!servico.itemListaServico.trim()) throw new Error("Informe o código do serviço.");
      if (servico.discriminacao.trim().length < 3)
        throw new Error("Descreva o serviço prestado.");
      if (n(servico.valorServicos) <= 0) throw new Error("Informe o valor do serviço.");
      return emitirFn({
        data: {
          tomador,
          servico: {
            competencia: servico.competencia,
            itemListaServico: servico.itemListaServico,
            cnae: servico.cnae,
            codigoTributacaoMunicipio: servico.codigoTributacaoMunicipio,
            discriminacao: servico.discriminacao,
            codigoMunicipioPrestacao: servico.codigoMunicipioPrestacao,
            valorServicos: n(servico.valorServicos),
            descontoIncondicionado: n(servico.descontoIncondicionado),
            deducoes: n(servico.deducoes),
            baseCalculo: calculo.base,
            aliquota: n(servico.aliquota),
            issRetido: servico.issRetido,
            valorIss: calculo.iss,
            pis: n(servico.pis),
            cofins: n(servico.cofins),
            inss: n(servico.inss),
            ir: n(servico.ir),
            csll: n(servico.csll),
          },
        },
      });
    },
    onSuccess: (res) => {
      setResultado(res);
      onEmitida();
      if (res.ok) toast.success("NFS-e emitida com sucesso");
      else toast.error("NFS-e rejeitada", { description: res.erroMensagem ?? "" });
    },
    onError: (e: Error) => toast.error("Não foi possível emitir", { description: e.message }),
  });

  const reenviar = useMutation({
    mutationFn: async (id: string) => reenviarFn({ data: { id } }),
    onSuccess: (res) => {
      setResultado((antigo) =>
        antigo ? { ...antigo, ...res } : (res as unknown as typeof antigo),
      );
      onEmitida();
      toast[res.ok ? "success" : "error"](res.ok ? "NFS-e autorizada" : "Continua rejeitada", {
        description: res.erroMensagem ?? "",
      });
    },
    onError: (e: Error) => toast.error("Falha ao reenviar", { description: e.message }),
  });

  async function baixarXml(id: string) {
    const x = await xmlFn({ data: { id } });
    const blob = new Blob([x.resposta || x.envio], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nfse-${id}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function abrirNota(id: string, url: string | null) {
    let link = url;
    if (!link) {
      const r = await urlFn({ data: { id } });
      link = r.urlNfse;
    }
    if (!link) {
      toast.error("A prefeitura ainda não disponibilizou o documento desta nota.");
      return;
    }
    window.open(link, "_blank", "noopener");
  }

  if (resultado?.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="size-5" /> NFS-e emitida com sucesso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Número</dt>
              <dd className="font-medium">{resultado.numeroNfse ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Código de verificação</dt>
              <dd className="font-medium">{resultado.codigoVerificacao ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Número RPS</dt>
              <dd className="font-medium">
                {resultado.rpsNumero ?? "—"}
                {resultado.rpsSerie ? ` / série ${resultado.rpsSerie}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Data</dt>
              <dd className="font-medium">
                {(resultado.dataEmissao ?? new Date().toISOString()).slice(0, 10)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tomador</dt>
              <dd className="font-medium">{tomador.nome}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-medium">{brl(n(servico.valorServicos))}</dd>
            </div>
          </dl>
          <Badge className={statusCor["AUTORIZADA"]}>Status: AUTORIZADA</Badge>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => abrirNota(resultado.id, resultado.urlNfse)}>
              <ExternalLink className="mr-2 size-4" /> Visualizar NFS-e
            </Button>
            <Button variant="outline" onClick={() => abrirNota(resultado.id, resultado.urlNfse)}>
              <Download className="mr-2 size-4" /> Baixar PDF
            </Button>
            <Button variant="outline" onClick={() => baixarXml(resultado.id)}>
              <FileText className="mr-2 size-4" /> Baixar XML
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `mailto:${tomador.email}?subject=${encodeURIComponent(
                    `NFS-e ${resultado.numeroNfse ?? ""}`,
                  )}&body=${encodeURIComponent(
                    `Segue a nota fiscal: ${resultado.urlNfse ?? ""}`,
                  )}`,
                )
              }
            >
              <Mail className="mr-2 size-4" /> Enviar por e-mail
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setResultado(null);
                setTomador(tomadorVazio);
                setServico(servicoVazio);
              }}
            >
              Emitir nova nota
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {resultado && !resultado.ok ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="size-5" /> NFS-e rejeitada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Código:</span>{" "}
              {resultado.erroCodigo ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Mensagem:</span>{" "}
              {resultado.erroMensagem ?? "—"}
            </p>
            {resultado.correcao ? (
              <p>
                <span className="text-muted-foreground">Correção:</span> {resultado.correcao}
              </p>
            ) : null}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                disabled={reenviar.isPending}
                onClick={() => reenviar.mutate(resultado.id)}
              >
                {reenviar.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 size-4" />
                )}
                Tentar novamente
              </Button>
              <p className="self-center text-xs text-muted-foreground">
                O mesmo RPS {resultado.rpsNumero} é reaproveitado — nenhum número novo é gerado.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do prestador</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Razão social</p>
            <p className="font-medium">{cfg.data?.config?.razao_social || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CNPJ</p>
            <p className="font-medium">{cfg.data?.cnpj ? formatarDocumento(cfg.data.cnpj) : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Inscrição Municipal</p>
            <p className="font-medium">{cfg.data?.inscricaoMunicipal || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Simples Nacional</p>
            <p className="font-medium">{cfg.data?.config?.optante_simples ? "Sim" : "Não"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Incentivador cultural</p>
            <p className="font-medium">{cfg.data?.config?.incentivador_cultural ? "Sim" : "Não"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Próximo RPS</p>
            <p className="font-medium">
              {cfg.data?.config?.proximo_rps ?? "—"} / série {cfg.data?.config?.serie_rps ?? "1"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do tomador</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Campo
            label="CPF/CNPJ"
            value={tomador.cpfCnpj}
            onChange={(v) => setTomador({ ...tomador, cpfCnpj: v })}
          />
          <Campo
            label="Razão social / Nome"
            value={tomador.nome}
            onChange={(v) => setTomador({ ...tomador, nome: v })}
          />
          <Campo
            label="E-mail"
            value={tomador.email}
            onChange={(v) => setTomador({ ...tomador, email: v })}
          />
          <Campo
            label="Telefone"
            value={tomador.telefone}
            onChange={(v) => setTomador({ ...tomador, telefone: v })}
          />
          <Campo label="CEP" value={tomador.cep} onChange={(v) => setTomador({ ...tomador, cep: v })} />
          <Campo
            label="Endereço"
            value={tomador.endereco}
            onChange={(v) => setTomador({ ...tomador, endereco: v })}
          />
          <Campo
            label="Número"
            value={tomador.numero}
            onChange={(v) => setTomador({ ...tomador, numero: v })}
          />
          <Campo
            label="Complemento"
            value={tomador.complemento}
            onChange={(v) => setTomador({ ...tomador, complemento: v })}
          />
          <Campo
            label="Bairro"
            value={tomador.bairro}
            onChange={(v) => setTomador({ ...tomador, bairro: v })}
          />
          <Campo
            label="Município"
            value={tomador.municipio}
            onChange={(v) => setTomador({ ...tomador, municipio: v })}
          />
          <Campo
            label="Código IBGE do município"
            value={tomador.codigoMunicipio}
            onChange={(v) => setTomador({ ...tomador, codigoMunicipio: v })}
          />
          <Campo label="UF" value={tomador.uf} onChange={(v) => setTomador({ ...tomador, uf: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do serviço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Campo
            label="Data de competência"
            type="date"
            value={servico.competencia}
            onChange={(v) => setServico({ ...servico, competencia: v })}
          />
          <Campo
            label="Código do serviço (LC 116)"
            value={servico.itemListaServico}
            onChange={(v) => setServico({ ...servico, itemListaServico: v })}
            placeholder="17.01"
          />
          <Campo label="CNAE" value={servico.cnae} onChange={(v) => setServico({ ...servico, cnae: v })} />
          <Campo
            label="Código de tributação municipal"
            value={servico.codigoTributacaoMunicipio}
            onChange={(v) => setServico({ ...servico, codigoTributacaoMunicipio: v })}
          />
          <Campo
            label="Município da prestação (IBGE)"
            value={servico.codigoMunicipioPrestacao}
            onChange={(v) => setServico({ ...servico, codigoMunicipioPrestacao: v })}
          />
          <div className="sm:col-span-3 space-y-1.5">
            <Label className="text-xs">Descrição do serviço</Label>
            <Textarea
              rows={3}
              value={servico.discriminacao}
              onChange={(e) => setServico({ ...servico, discriminacao: e.target.value })}
            />
          </div>
          <Campo
            label="Valor do serviço"
            value={servico.valorServicos}
            onChange={(v) => setServico({ ...servico, valorServicos: v })}
            placeholder="0,00"
          />
          <Campo
            label="Desconto"
            value={servico.descontoIncondicionado}
            onChange={(v) => setServico({ ...servico, descontoIncondicionado: v })}
          />
          <Campo
            label="Deduções"
            value={servico.deducoes}
            onChange={(v) => setServico({ ...servico, deducoes: v })}
          />
          <Campo
            label="Alíquota ISS (%)"
            value={servico.aliquota}
            onChange={(v) => setServico({ ...servico, aliquota: v })}
          />
          <div className="space-y-1.5">
            <Label className="text-xs">Base de cálculo</Label>
            <Input value={brl(calculo.base)} readOnly />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor do ISS</Label>
            <Input value={brl(calculo.iss)} readOnly />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch
              checked={servico.issRetido}
              onCheckedChange={(v) => setServico({ ...servico, issRetido: v })}
            />
            <Label className="text-xs">ISS retido pelo tomador</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retenções federais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          <Campo label="PIS" value={servico.pis} onChange={(v) => setServico({ ...servico, pis: v })} />
          <Campo
            label="COFINS"
            value={servico.cofins}
            onChange={(v) => setServico({ ...servico, cofins: v })}
          />
          <Campo label="INSS" value={servico.inss} onChange={(v) => setServico({ ...servico, inss: v })} />
          <Campo label="IR" value={servico.ir} onChange={(v) => setServico({ ...servico, ir: v })} />
          <Campo label="CSLL" value={servico.csll} onChange={(v) => setServico({ ...servico, csll: v })} />
          <div className="sm:col-span-5 text-sm text-muted-foreground">
            Retenções: {brl(calculo.retencoes)} · Valor líquido estimado: {brl(calculo.liquido)}
          </div>
        </CardContent>
      </Card>

      <Button size="lg" disabled={emitir.isPending} onClick={() => emitir.mutate()}>
        {emitir.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Emitir NFS-e
      </Button>
    </div>
  );
}

function Historico() {
  const [periodo, setPeriodo] = useState("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const xmlFn = useServerFn(nfseXml);
  const urlFn = useServerFn(nfseConsultarUrl);
  const consultarFn = useServerFn(nfseConsultar);
  const cancelarFn = useServerFn(nfseCancelar);
  const queryClient = useQueryClient();

  const intervalo = useMemo(() => {
    const agora = new Date();
    const zerar = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    if (periodo === "hoje") return { de: zerar(agora), ate: null as string | null };
    if (periodo === "semana") {
      const d = new Date(agora);
      d.setDate(d.getDate() - 7);
      return { de: zerar(d), ate: null };
    }
    if (periodo === "mes") {
      const d = new Date(agora.getFullYear(), agora.getMonth(), 1);
      return { de: d.toISOString(), ate: null };
    }
    return {
      de: de ? new Date(de).toISOString() : null,
      ate: ate ? new Date(`${ate}T23:59:59`).toISOString() : null,
    };
  }, [periodo, de, ate]);

  const notas = useQuery({
    queryKey: ["nfse-notas", intervalo, busca, status],
    queryFn: () => nfseListar({ data: { ...intervalo, busca, status } }),
  });

  async function baixarXml(id: string) {
    const x = await xmlFn({ data: { id } });
    const blob = new Blob([x.resposta || x.envio], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nfse-${id}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function abrir(nota: NotaLinha) {
    let link = nota.url_nfse;
    if (!link) link = (await urlFn({ data: { id: nota.id } })).urlNfse;
    if (!link) {
      toast.error("A prefeitura ainda não disponibilizou o documento desta nota.");
      return;
    }
    window.open(link, "_blank", "noopener");
  }

  const cancelar = useMutation({
    mutationFn: async (nota: NotaLinha) => {
      const motivo = window.prompt("Motivo do cancelamento:", "Erro na emissão");
      if (motivo === null) return null;
      return cancelarFn({ data: { id: nota.id, codigoCancelamento: "1", motivo } });
    },
    onSuccess: (res) => {
      if (!res) return;
      queryClient.invalidateQueries({ queryKey: ["nfse-notas"] });
      if (res.ok) toast.success("NFS-e cancelada");
      else
        toast.error("Cancelamento recusado", {
          description: `${res.erroCodigo ?? ""} ${res.erroMensagem ?? ""}`.trim(),
        });
    },
    onError: (e: Error) => toast.error("Falha ao cancelar", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Esta semana</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="custom">Período personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodo === "custom" ? (
            <>
              <Campo label="De" type="date" value={de} onChange={setDe} />
              <Campo label="Até" type="date" value={ate} onChange={setAte} />
            </>
          ) : null}
          <div className="space-y-1.5">
            <Label className="text-xs">Situação</Label>
            <Select value={status || "todas"} onValueChange={(v) => setStatus(v === "todas" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="AUTORIZADA">Autorizada</SelectItem>
                <SelectItem value="REJEITADA">Rejeitada</SelectItem>
                <SelectItem value="CANCELADA">Cancelada</SelectItem>
                <SelectItem value="SUBSTITUIDA">Substituída</SelectItem>
                <SelectItem value="PROCESSANDO">Processando</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Buscar (CPF/CNPJ, nome, NFS-e ou RPS)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {notas.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (notas.data ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma nota no período escolhido.
            </p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">NFS-e</th>
                  <th>RPS</th>
                  <th>Data</th>
                  <th>Tomador</th>
                  <th>CPF/CNPJ</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(notas.data ?? []).map((nota) => (
                  <tr key={nota.id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{nota.numero_nfse ?? "—"}</td>
                    <td>
                      {nota.rps_numero}/{nota.rps_serie}
                    </td>
                    <td>{new Date(nota.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="max-w-[180px] truncate">{nota.tomador_nome}</td>
                    <td>{formatarDocumento(nota.tomador_cpf_cnpj)}</td>
                    <td>{brl(Number(nota.valor_servico))}</td>
                    <td>
                      <Badge className={statusCor[nota.status] ?? ""}>{nota.status}</Badge>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Visualizar" onClick={() => abrir(nota)}>
                          <ExternalLink className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Baixar PDF" onClick={() => abrir(nota)}>
                          <Download className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Baixar XML"
                          onClick={() => baixarXml(nota.id)}
                        >
                          <FileText className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Consultar na prefeitura"
                          onClick={async () => {
                            const r = await consultarFn({ data: { id: nota.id } });
                            toast[r.ok ? "success" : "error"](
                              r.ok ? "Nota localizada na prefeitura" : "Consulta sem retorno",
                              { description: r.erroMensagem ?? r.numeroNfse ?? "" },
                            );
                          }}
                        >
                          <RefreshCcw className="size-4" />
                        </Button>
                        {nota.status === "AUTORIZADA" ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Cancelar"
                              onClick={() => cancelar.mutate(nota)}
                            >
                              <XCircle className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Substituir (emita a nova nota na aba Emitir)"
                              onClick={() =>
                                toast.info(
                                  "Para substituir, cancele esta nota e emita a nova na aba Emitir.",
                                )
                              }
                            >
                              <Repeat className="size-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Configuracoes() {
  const queryClient = useQueryClient();
  const cfg = useQuery({ queryKey: ["nfse-config"], queryFn: () => nfseConfig() });
  const salvarFn = useServerFn(nfseSalvarConfig);
  const testarFn = useServerFn(nfseTestarConexao);
  const [form, setForm] = useState<Record<string, string | boolean | number> | null>(null);
  const [teste, setTeste] = useState<{ situacao: string; detalhe: string } | null>(null);

  const dados = form ?? (cfg.data?.config as unknown as Record<string, string | boolean | number>) ?? null;
  const set = (k: string, v: string | boolean | number) => setForm({ ...(dados ?? {}), [k]: v });

  const salvar = useMutation({
    mutationFn: async () =>
      salvarFn({
        data: {
          razao_social: String(dados?.["razao_social"] ?? ""),
          nome_fantasia: String(dados?.["nome_fantasia"] ?? ""),
          cnpj: String(dados?.["cnpj"] ?? ""),
          inscricao_municipal: String(dados?.["inscricao_municipal"] ?? ""),
          regime_tributario: Number(dados?.["regime_tributario"] ?? 0),
          optante_simples: Boolean(dados?.["optante_simples"]),
          incentivador_cultural: Boolean(dados?.["incentivador_cultural"]),
          serie_rps: String(dados?.["serie_rps"] ?? "1"),
          proximo_rps: Number(dados?.["proximo_rps"] ?? 1),
          ambiente: (String(dados?.["ambiente"] ?? "producao") === "homologacao"
            ? "homologacao"
            : "producao") as "producao" | "homologacao",
          endpoint_url: String(
            dados?.["endpoint_url"] ?? "https://nfse.issnetonline.com.br/abrasf204/goiania/nfse.asmx",
          ),
        },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      queryClient.invalidateQueries({ queryKey: ["nfse-config"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const testar = useMutation({
    mutationFn: async () => testarFn({}),
    onSuccess: (r) => setTeste(r),
    onError: (e: Error) => setTeste({ situacao: "indisponivel", detalhe: e.message }),
  });

  if (cfg.isLoading || !dados) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rotulo: Record<string, string> = {
    conectado: "Conectado",
    incompleto: "Configuração incompleta",
    certificado: "Certificado inválido ou expirado",
    indisponivel: "WebService indisponível / falha de comunicação",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurações &gt; NFS-e</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Campo
          label="Razão social do prestador"
          value={String(dados["razao_social"] ?? "")}
          onChange={(v) => set("razao_social", v)}
        />
        <Campo
          label="Nome fantasia"
          value={String(dados["nome_fantasia"] ?? "")}
          onChange={(v) => set("nome_fantasia", v)}
        />
        <Campo label="CNPJ" value={String(dados["cnpj"] ?? "")} onChange={(v) => set("cnpj", v)} />
        <Campo
          label="Inscrição Municipal"
          value={String(dados["inscricao_municipal"] ?? "")}
          onChange={(v) => set("inscricao_municipal", v)}
        />
        <Campo
          label="Regime tributário (código)"
          value={String(dados["regime_tributario"] ?? 0)}
          onChange={(v) => set("regime_tributario", Number(v) || 0)}
        />
        <Campo
          label="Série do RPS"
          value={String(dados["serie_rps"] ?? "1")}
          onChange={(v) => set("serie_rps", v)}
        />
        <Campo
          label="Próximo RPS"
          value={String(dados["proximo_rps"] ?? 1)}
          onChange={(v) => set("proximo_rps", Number(v) || 1)}
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Ambiente</Label>
          <Select
            value={String(dados["ambiente"] ?? "producao")}
            onValueChange={(v) => set("ambiente", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="producao">Produção</SelectItem>
              <SelectItem value="homologacao">Homologação</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Campo
          label="Endereço do WebService"
          value={String(dados["endpoint_url"] ?? "")}
          onChange={(v) => set("endpoint_url", v)}
        />
        <div className="flex items-center gap-2">
          <Switch
            checked={Boolean(dados["optante_simples"])}
            onCheckedChange={(v) => set("optante_simples", v)}
          />
          <Label className="text-xs">Optante pelo Simples Nacional</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={Boolean(dados["incentivador_cultural"])}
            onCheckedChange={(v) => set("incentivador_cultural", v)}
          />
          <Label className="text-xs">Incentivador cultural</Label>
        </div>

        <div className="sm:col-span-3 rounded-lg border border-border/60 p-3 text-sm">
          <p className="text-muted-foreground">
            Município: Goiânia/GO (IBGE {String(dados["codigo_municipio"] ?? "5208707")}) · padrão{" "}
            {String(dados["padrao"] ?? "abrasf204").toUpperCase()}
          </p>
          <p className="mt-1">
            Certificado digital A1:{" "}
            {cfg.data?.certificado ? (
              <span className="text-emerald-600">enviado e guardado com segurança</span>
            ) : (
              <span className="text-destructive">ainda não enviado</span>
            )}
          </p>
        </div>

        <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Salvar configurações
          </Button>
          <Button variant="outline" disabled={testar.isPending} onClick={() => testar.mutate()}>
            {testar.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plug className="mr-2 size-4" />
            )}
            Testar conexão
          </Button>
          {teste ? (
            <span
              className={`flex items-center gap-2 text-sm ${
                teste.situacao === "conectado" ? "text-emerald-600" : "text-destructive"
              }`}
            >
              {teste.situacao === "conectado" ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
              {rotulo[teste.situacao] ?? teste.situacao}: {teste.detalhe}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

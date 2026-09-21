import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Download, Upload, DatabaseBackup, MessagesSquare, Users, Users2 } from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import {
  exportarContatos,
  exportarConversas,
  gerarBackup,
  restaurarBackup,
} from "@/lib/backup.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({
    meta: [
      { title: "Backup e restauração — Central" },
      {
        name: "description",
        content:
          "Baixe um arquivo com todas as configurações, integrações e conversas da central e restaure tudo quando precisar.",
      },
      { property: "og:title", content: "Backup e restauração — Central" },
      {
        property: "og:description",
        content: "Gere e restaure o backup completo da central de atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

type Resumo = { tabela: string; registros: number; erro?: string };

/** Baixa um conteúdo gerado no navegador como arquivo. */
function baixarArquivo(conteudo: string, nome: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

const hoje = () => new Date().toISOString().slice(0, 10);

function BackupPage() {
  const { isAdmin } = useMe();
  const gerarFn = useServerFn(gerarBackup);
  const restaurarFn = useServerFn(restaurarBackup);
  const conversasFn = useServerFn(exportarConversas);
  const contatosFn = useServerFn(exportarContatos);
  const fileRef = useRef<HTMLInputElement>(null);

  const baixarConversas = useMutation({
    mutationFn: (opcoes: { incluirGrupos: boolean; somenteGrupos: boolean }) =>
      conversasFn({ data: opcoes }),
    onSuccess: (res) => {
      baixarArquivo(
        JSON.stringify(res, null, 2),
        `conversas-${hoje()}.json`,
        "application/json",
      );
      toast.success("Conversas exportadas", {
        description: `${res.totalConversas} conversa(s) e ${res.totalMensagens} mensagem(ns).`,
      });
    },
    onError: (e: Error) => toast.error("Não foi possível exportar", { description: e.message }),
  });

  const baixarContatos = useMutation({
    mutationFn: () => contatosFn(),
    onSuccess: (res) => {
      baixarArquivo(res.csv, `contatos-${hoje()}.csv`, "text/csv;charset=utf-8");
      toast.success("Contatos exportados", {
        description: `${res.pessoas} pessoa(s) e ${res.grupos} grupo(s).`,
      });
    },
    onError: (e: Error) => toast.error("Não foi possível exportar", { description: e.message }),
  });

  const [incluirHistorico, setIncluirHistorico] = useState(true);
  const [incluirChaves, setIncluirChaves] = useState(true);
  const [resumo, setResumo] = useState<Resumo[] | null>(null);

  const gerar = useMutation({
    mutationFn: () => gerarFn({ data: { incluirHistorico, incluirChaves } }),
    onSuccess: (backup) => {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dia = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `backup-central-${dia}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setResumo(backup.resumo);
      toast.success("Backup gerado", { description: "O arquivo foi baixado no seu computador." });
    },
    onError: (e: Error) => toast.error("Não foi possível gerar o backup", { description: e.message }),
  });

  const restaurar = useMutation({
    mutationFn: async (arquivo: File) => {
      const texto = await arquivo.text();
      const json = JSON.parse(texto) as { conteudo?: Record<string, Record<string, unknown>[]> };
      if (!json?.conteudo) throw new Error("Arquivo inválido: selecione um backup gerado aqui.");
      return restaurarFn({ data: { conteudo: json.conteudo } });
    },
    onSuccess: (res) => {
      setResumo(res.resultado);
      if (res.ok) toast.success("Backup restaurado com sucesso");
      else toast.warning("Backup restaurado com avisos", { description: "Veja o resumo abaixo." });
    },
    onError: (e: Error) => toast.error("Não foi possível restaurar", { description: e.message }),
  });

  if (!isAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem gerar ou restaurar backups.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <DatabaseBackup className="size-5 text-primary" /> Backup e restauração
        </h1>
        <p className="text-sm text-muted-foreground">
          Baixe um único arquivo com tudo o que já foi configurado: integrações, chaves de API,
          dispositivos, filas, chatbot, menus, contatos e conversas. Depois basta enviar o arquivo de
          volta para recuperar tudo.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Gerar backup</h2>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <Label>Incluir conversas e contatos</Label>
            <p className="text-xs text-muted-foreground">
              Histórico de atendimento, mensagens e transferências.
            </p>
          </div>
          <Switch checked={incluirHistorico} onCheckedChange={setIncluirHistorico} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <Label>Incluir chaves e tokens das APIs</Label>
            <p className="text-xs text-muted-foreground">
              Guarde o arquivo em local seguro: ele conterá credenciais.
            </p>
          </div>
          <Switch checked={incluirChaves} onCheckedChange={setIncluirChaves} />
        </div>

        <Button onClick={() => gerar.mutate()} disabled={gerar.isPending}>
          <Download className="mr-1.5 size-4" />
          {gerar.isPending ? "Gerando..." : "Baixar backup completo"}
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Cópias separadas</h2>
        <p className="text-sm text-muted-foreground">
          Baixe só as conversas (com todo o histórico de mensagens), só os grupos ou a lista de
          contatos em planilha.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={baixarConversas.isPending}
            onClick={() =>
              baixarConversas.mutate({ incluirGrupos: true, somenteGrupos: false })
            }
          >
            <MessagesSquare className="mr-1.5 size-4" />
            Todas as conversas
          </Button>
          <Button
            variant="outline"
            disabled={baixarConversas.isPending}
            onClick={() => baixarConversas.mutate({ incluirGrupos: true, somenteGrupos: true })}
          >
            <Users2 className="mr-1.5 size-4" />
            Somente grupos
          </Button>
          <Button
            variant="outline"
            disabled={baixarContatos.isPending}
            onClick={() => baixarContatos.mutate()}
          >
            <Users className="mr-1.5 size-4" />
            Contatos (planilha)
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Restaurar backup</h2>
        <p className="text-sm text-muted-foreground">
          Envie o arquivo baixado anteriormente. Os registros são recriados ou atualizados pelo
          mesmo identificador — nada é apagado.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) restaurar.mutate(arquivo);
          }}
        />
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={restaurar.isPending}
        >
          <Upload className="mr-1.5 size-4" />
          {restaurar.isPending ? "Restaurando..." : "Selecionar arquivo do backup"}
        </Button>
      </section>

      {resumo && (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Resumo</h2>
          <ul className="space-y-1.5">
            {resumo.map((item) => (
              <li key={item.tabela} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">{item.tabela}</span>
                {item.erro ? (
                  <Badge variant="destructive">{item.erro}</Badge>
                ) : (
                  <span className="text-muted-foreground">{item.registros} registro(s)</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

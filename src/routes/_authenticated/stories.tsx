import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, Radio, Images, CheckCircle2, XCircle, Send } from "lucide-react";

import {
  listStoriesRecebidos,
  listCanaisConectados,
  listStoriesPublicados,
  enviarNoCanal,
} from "@/lib/stories.functions";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listWhatsappDevices } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/stories")({
  head: () => ({
    meta: [
      { title: "Stories e canais — Publicações das conexões conectadas" },
      {
        name: "description",
        content:
          "Veja os stories (status) e os canais das conexões de WhatsApp conectadas à central, com as publicações recebidas e as enviadas.",
      },
      { property: "og:title", content: "Stories e canais" },
      {
        property: "og:description",
        content: "Stories e canais das conexões de WhatsApp conectadas à central.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoriesPage,
});

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function rotuloMidia(tipo: string) {
  if (tipo === "imagem") return "Foto";
  if (tipo === "video") return "Vídeo";
  if (tipo === "audio") return "Áudio";
  return "Texto";
}

function StoryCard({
  item,
}: {
  item: {
    id: string;
    autorNome: string;
    autorJid: string;
    texto: string;
    midiaUrl: string;
    midiaTipo: string;
    createdAt: string;
    conexao: string;
    chatJid: string;
  };
}) {
  const autor = item.autorNome || item.autorJid.split("@")[0] || "Desconhecido";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{autor}</span>
          <Badge variant="secondary">{rotuloMidia(item.midiaTipo)}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
      </div>
      {item.midiaUrl && item.midiaTipo === "imagem" ? (
        <img
          src={item.midiaUrl}
          alt={`Publicação de ${autor}`}
          className="mt-2 max-h-64 w-full rounded-md object-cover"
          loading="lazy"
        />
      ) : null}
      {item.midiaUrl && item.midiaTipo === "video" ? (
        <video src={item.midiaUrl} controls className="mt-2 max-h-64 w-full rounded-md" />
      ) : null}
      {item.texto ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.texto}</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">Conexão: {item.conexao}</p>
    </div>
  );
}

function StoriesPage() {
  const [deviceId, setDeviceId] = useState<string>("todos");
  const idEscolhido = deviceId === "todos" ? null : deviceId;

  const devices = useQuery({ queryKey: ["whatsapp-devices"], queryFn: () => listWhatsappDevices() });

  const recebidos = useQuery({
    queryKey: ["stories-recebidos", idEscolhido],
    queryFn: () => listStoriesRecebidos({ data: { tipo: "status", deviceId: idEscolhido } }),
    retry: 2,
  });

  const canalPosts = useQuery({
    queryKey: ["canais-recebidos", idEscolhido],
    queryFn: () => listStoriesRecebidos({ data: { tipo: "canal", deviceId: idEscolhido } }),
    retry: 2,
  });

  const canais = useQuery({
    queryKey: ["canais-conectados", idEscolhido],
    queryFn: () => listCanaisConectados({ data: { deviceId: idEscolhido } }),
    retry: 1,
  });

  const publicados = useQuery({
    queryKey: ["stories-publicados"],
    queryFn: () => listStoriesPublicados(),
    retry: 2,
  });

  const conexoes = devices.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Stories e canais</h1>
          <p className="text-sm text-muted-foreground">
            Publicações de status (stories) e dos canais das conexões conectadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={deviceId} onValueChange={setDeviceId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Todas as conexões" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as conexões</SelectItem>
              {conexoes.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                  {d.status === "connected" ? "" : " (desconectada)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              void recebidos.refetch();
              void canalPosts.refetch();
              void canais.refetch();
              void publicados.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="stories">
        <TabsList>
          <TabsTrigger value="stories">Stories recebidos</TabsTrigger>
          <TabsTrigger value="canais">Canais</TabsTrigger>
          <TabsTrigger value="enviados">Stories publicados</TabsTrigger>
        </TabsList>

        <TabsContent value="stories" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Images className="h-4 w-4" /> Status / Stories recebidos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recebidos.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </p>
              ) : recebidos.isError ? (
                <p className="text-sm text-destructive">
                  Não foi possível carregar os stories agora. Toque em Atualizar.
                </p>
              ) : (recebidos.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum story recebido ainda. Os status publicados pelos seus contatos aparecem aqui
                  conforme chegam.
                </p>
              ) : (
                (recebidos.data ?? []).map((item) => <StoryCard key={item.id} item={item} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canais" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="h-4 w-4" /> Canais da conexão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canais.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Consultando a conexão…
                </p>
              ) : canais.isError ? (
                <p className="text-sm text-destructive">
                  {canais.error instanceof Error
                    ? canais.error.message
                    : "Não foi possível consultar os canais."}
                </p>
              ) : (
                <>
                  {canais.data?.aviso ? (
                    <p className="text-sm text-muted-foreground">{canais.data.aviso}</p>
                  ) : null}
                  {(canais.data?.canais ?? []).map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                    >
                      <div>
                        <p className="font-medium text-foreground">{c.nome}</p>
                        {c.descricao ? (
                          <p className="text-xs text-muted-foreground">{c.descricao}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {c.podeEnviar ? (
                          <Badge>{c.papel === "owner" ? "Você é dono" : "Você é admin"}</Badge>
                        ) : null}
                        {c.inscritos !== null ? (
                          <Badge variant="secondary">{c.inscritos} inscritos</Badge>
                        ) : null}
                        {c.podeEnviar ? (
                          <Button size="sm" onClick={() => setCanalEnvio({ id: c.id, nome: c.nome })}>
                            <Send className="mr-2 h-4 w-4" />
                            Enviar mensagem
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publicações recebidas dos canais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(canalPosts.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma publicação de canal recebida ainda.
                </p>
              ) : (
                (canalPosts.data ?? []).map((item) => <StoryCard key={item.id} item={item} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enviados" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stories publicados pela central</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(publicados.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum story publicado ainda. Crie uma postagem em Postagens e Stories.
                </p>
              ) : (
                (publicados.data ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
                  >
                    <span className="flex items-center gap-2 text-foreground">
                      {p.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      {p.destino}
                    </span>
                    <span className="text-muted-foreground">{p.detalhe}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

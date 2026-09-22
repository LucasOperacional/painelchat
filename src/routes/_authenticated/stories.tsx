import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Images, Loader2, Music2, Radio, RefreshCw, Send, XCircle } from "lucide-react";

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
  if (tipo === "documento") return "Documento";
  if (tipo === "figurinha") return "Figurinha";
  if (tipo === "nao_suportada") return "Não suportada";
  return "Texto";
}

function primeiraUrl(texto: string) {
  return texto.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.;]+$/, "") ?? "";
}

function tipoDoStory(item: { texto: string; midiaTipo: string; midiaUrl: string }) {
  const tipo = item.midiaTipo || "";
  if (["imagem", "video", "audio", "documento", "figurinha", "nao_suportada"].includes(tipo)) return tipo;
  const texto = item.texto.trim().toLocaleLowerCase("pt-BR");
  if (texto.startsWith("🖼 imagem:") || texto.startsWith("🖼 figurinha:")) return "imagem";
  if (texto.startsWith("🎬 vídeo:") || texto.startsWith("🎬 video:")) return "video";
  if (texto.startsWith("🎵 áudio:") || texto.startsWith("🎵 audio:")) return "audio";
  if (texto.startsWith("📎")) return "documento";
  if (texto.includes("não suportada") || texto.includes("nao suportada")) return "nao_suportada";
  const url = item.midiaUrl || primeiraUrl(item.texto);
  if (/\.(mp4|mov|webm|3gp)(\?|$)/i.test(url)) return "video";
  if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) return "imagem";
  return "nenhum";
}

function textoSemLinhaDaMidia(texto: string) {
  return texto
    .split("\n")
    .filter((linha) => !/^(🖼\s*(Imagem|Figurinha)|🎬\s*(Vídeo|Video)|🎵\s*(Áudio|Audio)|📎)/i.test(linha.trim()))
    .join("\n")
    .trim();
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
  const tipo = tipoDoStory(item);
  const mediaUrl = item.midiaUrl || primeiraUrl(item.texto);
  const texto = ["imagem", "video", "audio", "documento", "figurinha"].includes(tipo)
    ? textoSemLinhaDaMidia(item.texto)
    : item.texto;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{autor}</span>
          <Badge variant={tipo === "nao_suportada" ? "outline" : "secondary"}>{rotuloMidia(tipo)}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
      </div>
      {mediaUrl && (tipo === "imagem" || tipo === "figurinha") ? (
        <img
          src={mediaUrl}
          alt={`Publicação de ${autor}`}
          className="mt-2 max-h-80 w-full rounded-md object-contain"
          loading="lazy"
        />
      ) : null}
      {mediaUrl && tipo === "video" ? (
        <video src={mediaUrl} controls className="mt-2 max-h-80 w-full rounded-md" />
      ) : null}
      {mediaUrl && tipo === "audio" ? (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
          <Music2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <audio src={mediaUrl} controls className="w-full" />
        </div>
      ) : null}
      {mediaUrl && tipo === "documento" ? (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-foreground underline-offset-4 hover:underline"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          Abrir documento
        </a>
      ) : null}
      {tipo === "nao_suportada" ? (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{texto || "Mensagem não suportada recebida"}</span>
        </div>
      ) : null}
      {texto && tipo !== "nao_suportada" ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{texto}</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">Conexão: {item.conexao}</p>
    </div>
  );
}

function StoriesPage() {
  const [deviceId, setDeviceId] = useState<string>("todos");
  const idEscolhido = deviceId === "todos" ? null : deviceId;
  const [canalEnvio, setCanalEnvio] = useState<{ id: string; nome: string } | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [midiaUrl, setMidiaUrl] = useState("");
  const [enviando, setEnviando] = useState(false);

  const fecharEnvio = () => {
    setCanalEnvio(null);
    setMensagem("");
    setMidiaUrl("");
  };

  const publicar = async () => {
    if (!canalEnvio) return;
    setEnviando(true);
    try {
      const url = midiaUrl.trim();
      const r = await enviarNoCanal({
        data: {
          deviceId: idEscolhido,
          jid: canalEnvio.id,
          texto: mensagem,
          midiaUrl: url,
          midiaTipo: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? "video" : "imagem",
        },
      });
      toast.success(r.detalhe);
      fecharEnvio();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível publicar no canal.");
    } finally {
      setEnviando(false);
    }
  };

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

      <Dialog open={!!canalEnvio} onOpenChange={(aberto) => (aberto ? null : fecharEnvio())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar no canal</DialogTitle>
            <DialogDescription>
              A mensagem será publicada no canal {canalEnvio?.nome}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Escreva a mensagem do canal…"
              rows={5}
            />
            <Input
              value={midiaUrl}
              onChange={(e) => setMidiaUrl(e.target.value)}
              placeholder="Link de uma foto ou vídeo (opcional)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharEnvio} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={() => void publicar()} disabled={enviando}>
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

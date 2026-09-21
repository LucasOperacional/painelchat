import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Megaphone, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  enviarDivulgaZap,
  listarContatosDivulgaZap,
} from "@/lib/divulgazap.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/divulgazap")({
  head: () => ({
    meta: [
      { title: "DivulgaZap — Disparo de mensagens WhatsApp" },
      {
        name: "description",
        content:
          "Envie mensagens e notificações de WhatsApp para contatos e grupos usando a API DivulgaZap.",
      },
      { property: "og:title", content: "DivulgaZap — Disparo de mensagens" },
      {
        property: "og:description",
        content: "Dispare mensagens de WhatsApp pela API DivulgaZap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DivulgaZapPage,
});

function DivulgaZapPage() {
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const listarContatos = useServerFn(listarContatosDivulgaZap);
  const enviar = useServerFn(enviarDivulgaZap);

  const contatosQuery = useQuery({
    queryKey: ["divulgazap-contatos"],
    queryFn: () => listarContatos(),
  });

  const enviarMutation = useMutation({
    mutationFn: (input: { number: string; message: string; imageUrl: string }) =>
      enviar({ data: input }),
    onSuccess: () => {
      toast.success("Mensagem enviada com sucesso!");
      setMessage("");
      setImageUrl("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Megaphone className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">DivulgaZap</h1>
          <p className="text-sm text-muted-foreground">
            Dispare mensagens e notificações de WhatsApp pela API DivulgaZap.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova mensagem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Escolher contato cadastrado (opcional)</Label>
            <Select
              onValueChange={(value) => {
                const contato = (contatosQuery.data ?? []).find((c) => c.id === value);
                if (contato) setNumber(contato.phone.replace(/\D/g, ""));
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    contatosQuery.isLoading
                      ? "Carregando contatos..."
                      : "Selecione um contato"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(contatosQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || c.phone} — {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dz-number">Número (com DDI e DDD)</Label>
            <Input
              id="dz-number"
              placeholder="5519999999999"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dz-message">Mensagem</Label>
            <Textarea
              id="dz-message"
              placeholder="Mensagem a ser enviada."
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dz-image">URL da imagem (opcional)</Label>
            <Input
              id="dz-image"
              placeholder="https://exemplo.com/anexo.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            disabled={enviarMutation.isPending || !number.trim() || !message.trim()}
            onClick={() =>
              enviarMutation.mutate({
                number: number.trim(),
                message: message.trim(),
                imageUrl: imageUrl.trim(),
              })
            }
          >
            {enviarMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Enviar mensagem
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TITULO = "Loja de acessos — compre e receba na hora pelo WhatsApp";
const DESCRICAO =
  "Escolha o acesso que você quer, pague pelo Pix e receba o login automaticamente no WhatsApp.";

export const Route = createFileRoute("/loja")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LojaPublica,
});

type Produto = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  disponiveis: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function LojaPublica() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    fetch("/api/public/loja")
      .then((r) => r.json())
      .then((d) => {
        if (!ativo) return;
        setProdutos(d.produtos ?? []);
        setWhatsapp(String(d.whatsapp ?? ""));
      })
      .catch(() => undefined)
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, []);

  const comprar = (p: Produto) => {
    const texto = encodeURIComponent(`Olá! Quero comprar: ${p.nome} (${brl(p.preco)})`);
    const url = whatsapp ? `https://wa.me/${whatsapp}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank", "noopener");
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-6 py-14 text-center">
          <Badge className="mb-4">
            <Zap className="size-3.5" /> Entrega automática
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Loja de acessos</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Escolha o acesso, pague pelo Pix e receba login e senha na hora, direto no seu WhatsApp.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-10">
        {carregando && <p className="text-center text-muted-foreground">Carregando produtos…</p>}
        {!carregando && !produtos.length && (
          <p className="text-center text-muted-foreground">
            Nenhum produto disponível no momento. Volte em breve.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {produtos.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span>{p.nome}</span>
                  <Badge variant={p.disponiveis ? "default" : "secondary"}>
                    {p.disponiveis ? `${p.disponiveis} em estoque` : "Esgotado"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-muted-foreground">{p.descricao}</p>
                <div className="space-y-3">
                  <p className="text-2xl font-semibold">{brl(p.preco)}</p>
                  <Button
                    className="w-full"
                    disabled={!p.disponiveis}
                    onClick={() => comprar(p)}
                  >
                    <ShoppingBag className="size-4" />
                    {p.disponiveis ? "Comprar no WhatsApp" : "Sem estoque"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

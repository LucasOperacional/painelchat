import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { claimSharedDas } from "@/lib/das-mei.functions";

type Busca = { token?: string | undefined; nome?: string | undefined };

export const Route = createFileRoute("/_authenticated/das-mei/receber")({
  validateSearch: (search: Record<string, unknown>): Busca => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
    nome: typeof search["nome"] === "string" ? search["nome"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Receber DAS compartilhada — DAS MEI" },
      {
        name: "description",
        content: "Finaliza o envio da guia DAS compartilhada pelo celular para a sua área privada.",
      },
      { property: "og:title", content: "Receber DAS compartilhada — DAS MEI" },
      {
        property: "og:description",
        content: "Guia compartilhada pelo celular salva com segurança na sua conta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReceberPage,
});

function ReceberPage() {
  const { token, nome } = Route.useSearch();
  const navigate = useNavigate();
  const claim = useServerFn(claimSharedDas);
  const [erro, setErro] = useState<string | null>(null);
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    if (!token) {
      setErro("Nenhum arquivo compartilhado foi recebido.");
      return;
    }
    void claim({ data: { token, nome: nome ?? "guia.pdf" } })
      .then((res) => {
        if (res.ok) {
          toast.success("Guia recebida do celular e salva");
          void navigate({ to: "/das-mei" });
        } else {
          setErro(res.erro);
        }
      })
      .catch((e: Error) => setErro(e.message));
  }, [token, nome, claim, navigate]);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="size-6" />
        </span>
        {erro ? (
          <>
            <h1 className="text-lg font-semibold">Não deu para salvar</h1>
            <p className="text-sm text-muted-foreground">{erro}</p>
            <Button onClick={() => navigate({ to: "/das-mei" })}>Ir para DAS MEI</Button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Salvando a guia compartilhada…</h1>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Só um instante
            </p>
          </>
        )}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, FileText } from "lucide-react";

const NFSE_GOIANIA_URL =
  "https://www.notaeletronica.com.br/goiania/Login/Login_NFE.aspx";

export const Route = createFileRoute("/_authenticated/nfse-goiania")({
  head: () => ({
    meta: [
      { title: "Nota Fiscal Eletrônica — Goiânia" },
      {
        name: "description",
        content:
          "Acesso à emissão de NFS-e da Prefeitura de Goiânia para as notas fiscais eletrônicas dos clientes.",
      },
      { property: "og:title", content: "Nota Fiscal Eletrônica — Goiânia" },
      {
        property: "og:description",
        content:
          "Acesso à emissão de NFS-e da Prefeitura de Goiânia para as notas fiscais eletrônicas dos clientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NfseGoianiaPage,
});

function NfseGoianiaPage() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 sm:gap-6 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileText className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">
              Nota Fiscal Eletrônica — Goiânia
            </h1>
            <p className="text-sm text-muted-foreground">
              Prefeitura de Goiânia · emissão de NFS-e
            </p>
          </div>
        </div>
      </header>

      <div className="flex max-w-xl flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Emissão de NFS-e</h2>
            <p className="text-xs text-muted-foreground">
              Portal da Prefeitura de Goiânia
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Emita e acompanhe as notas fiscais eletrônicas dos clientes na
          prefeitura de Goiânia. Por segurança do portal da prefeitura, o site
          abre em uma nova aba — sua sessão aqui na central continua ativa.
        </p>
        <div className="mt-2">
          <a
            href={NFSE_GOIANIA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ExternalLink className="size-4" />
            Abrir NFS-e Goiânia
          </a>
        </div>
      </div>
    </div>
  );
}

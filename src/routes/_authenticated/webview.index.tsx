import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ExternalLink, Globe, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteWebview,
  listWebviews,
  saveWebview,
  type WebviewSite,
} from "@/lib/webviews.functions";
import { useMe } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/webview/")({
  head: () => ({
    meta: [
      { title: "Webview — sites dentro da central" },
      {
        name: "description",
        content: "Cadastre sites e sistemas externos e abra cada um deles dentro da central.",
      },
      { property: "og:title", content: "Webview — sites dentro da central" },
      {
        property: "og:description",
        content: "Atalhos para sistemas externos abertos direto na central, sem sair da tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebviewListPage,
});

type FormState = {
  id?: string;
  title: string;
  url: string;
  description: string;
  openExternal: boolean;
  useProxy: boolean;
  sortOrder: number;
};

const EMPTY: FormState = {
  title: "",
  url: "https://",
  description: "",
  openExternal: false,
  useProxy: true,
  sortOrder: 0,
};

function WebviewListPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();
  const fetchSites = useServerFn(listWebviews);
  const saveFn = useServerFn(saveWebview);
  const deleteFn = useServerFn(deleteWebview);

  const [form, setForm] = useState<FormState | null>(null);

  const sites = useQuery({ queryKey: ["webviews"], queryFn: () => fetchSites() });

  const salvar = useMutation({
    mutationFn: (data: FormState) =>
      saveFn({
        data: {
          ...(data.id ? { id: data.id } : {}),
          title: data.title,
          url: data.url,
          description: data.description,
          openExternal: data.openExternal,
          useProxy: data.useProxy,
          sortOrder: Number(data.sortOrder) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Site salvo.");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["webviews"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível salvar."),
  });

  const remover = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Site removido.");
      void queryClient.invalidateQueries({ queryKey: ["webviews"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível remover."),
  });

  const lista = sites.data ?? [];

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Webview</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre sites e sistemas externos para abrir dentro da central.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setForm({ ...EMPTY })}>
            <Plus className="size-4" /> Cadastrar site
          </Button>
        )}
      </div>

      {isAdmin && form && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Editar site" : "Novo site"}</CardTitle>
            <CardDescription>
              Alguns sites não permitem ser abertos dentro de outra página. Nesse caso, marque
              "Abrir em nova aba".
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wv-title">Nome</Label>
                <Input
                  id="wv-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex.: Receita Federal"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wv-url">Endereço (URL)</Label>
                <Input
                  id="wv-url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://exemplo.com.br"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wv-desc">Descrição (opcional)</Label>
              <Textarea
                id="wv-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="wv-external"
                  checked={form.openExternal}
                  onCheckedChange={(v) => setForm({ ...form, openExternal: v })}
                />
                <Label htmlFor="wv-external">Abrir em nova aba</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="wv-proxy"
                  checked={form.useProxy}
                  onCheckedChange={(v) => setForm({ ...form, useProxy: v })}
                />
                <Label htmlFor="wv-proxy">Liberar bloqueio (proxy)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="wv-order">Ordem</Label>
                <Input
                  id="wv-order"
                  type="number"
                  className="w-24"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={salvar.isPending} onClick={() => salvar.mutate(form)}>
                {salvar.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
              </Button>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sites.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando sites…
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum site cadastrado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((site: WebviewSite) => (
            <Card key={site.id} className="flex flex-col">
              <CardHeader className="flex-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="size-4 text-primary" /> {site.title}
                </CardTitle>
                <CardDescription className="break-all">
                  {site.description || site.url}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {site.open_external ? (
                  <Button asChild size="sm">
                    <a href={site.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" /> Abrir
                    </a>
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link to="/webview/$id" params={{ id: site.id }}>
                      <Globe className="size-4" /> Abrir aqui
                    </Link>
                  </Button>
                )}
                {isAdmin && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm({
                          id: site.id,
                          title: site.title,
                          url: site.url,
                          description: site.description,
                          openExternal: site.open_external,
                          useProxy: site.use_proxy,
                          sortOrder: site.sort_order,
                        })
                      }
                    >
                      <Pencil className="size-4" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Remover "${site.title}"?`)) remover.mutate(site.id);
                      }}
                    >
                      <Trash2 className="size-4" /> Remover
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

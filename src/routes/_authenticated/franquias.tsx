import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Globe, KeyRound, Plus, Save, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { useMe } from "@/hooks/use-session";
import {
  addProjectDomain,
  definirPainelPrincipal,
  deleteProject,
  getFranchiseSettings,
  listProjects,
  removeProjectDomain,
  saveFranchiseSettings,
  saveProject,
} from "@/lib/projects.functions";
import {
  conectarCloudflare,
  desconectarCloudflare,
  publicarDominioFranquia,
  statusCloudflare,
  verificarDominioCloudflare,
} from "@/lib/cloudflare.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/franquias")({
  validateSearch: z.object({ tab: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Franquias — Central" },
      {
        name: "description",
        content:
          "Crie franquias com endereço de acesso próprio, identidade visual personalizada e a mesma API de conexão da central.",
      },
      { property: "og:title", content: "Franquias — Central" },
      {
        property: "og:description",
        content: "Gerencie as franquias conectadas à central e os domínios de cada uma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FranchisesPage,
});

type FormState = {
  id?: string;
  name: string;
  slug: string;
  accessKey: string;
  domain: string;
  criarSubdominio: boolean;
  subdominio: string;
  isActive: boolean;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  headline: string;
  tagline: string;
};

function newAccessKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const EMPTY: FormState = {
  name: "",
  slug: "",
  accessKey: "",
  domain: "",
  criarSubdominio: true,
  subdominio: "",
  isActive: true,
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#0f766e",
  accentColor: "#14b8a6",
  headline: "",
  tagline: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function FranchisesPage() {
  const { isSuperAdmin, loading } = useMe();
  const search = useSearch({ from: "/_authenticated/franquias" });
  const nameRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const listFn = useServerFn(listProjects);
  const saveFn = useServerFn(saveProject);
  const removeFn = useServerFn(deleteProject);
  const addDomainFn = useServerFn(addProjectDomain);
  const removeDomainFn = useServerFn(removeProjectDomain);
  const definirPrincipalFn = useServerFn(definirPainelPrincipal);
  const settingsFn = useServerFn(getFranchiseSettings);
  const saveSettingsFn = useServerFn(saveFranchiseSettings);
  const cloudflareStatusFn = useServerFn(statusCloudflare);
  const connectCloudflareFn = useServerFn(conectarCloudflare);
  const disconnectCloudflareFn = useServerFn(desconectarCloudflare);
  const publishDomainFn = useServerFn(publicarDominioFranquia);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listFn({}),
    enabled: isSuperAdmin,
  });

  const settings = useQuery({
    queryKey: ["franchise-settings"],
    queryFn: () => settingsFn({}),
    enabled: isSuperAdmin,
  });

  const cloudflare = useQuery({
    queryKey: ["cloudflare-status"],
    queryFn: () => cloudflareStatusFn({}),
    enabled: isSuperAdmin,
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [domainInput, setDomainInput] = useState<Record<string, string>>({});
  const [baseDomain, setBaseDomain] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [cfMode, setCfMode] = useState<"token" | "global">("token");
  const [cfEmail, setCfEmail] = useState("");
  const [cfGlobalKey, setCfGlobalKey] = useState("");
  const [cfAccountId, setCfAccountId] = useState("");
  const [cfTargetIp, setCfTargetIp] = useState("");
  const [cfProxied, setCfProxied] = useState(false);
  const [cfCheck, setCfCheck] = useState("");
  const [novoPrincipal, setNovoPrincipal] = useState("");
  const checkDomainFn = useServerFn(verificarDominioCloudflare);
  type StatusEndereco = { estado: "verificando" | "ativo" | "inativo"; detalhe: string };
  const [statusEnderecos, setStatusEnderecos] = useState<Record<string, StatusEndereco>>({});

  const linkCloudflare = (host: string) => {
    const conta = cloudflare.data?.contaId;
    const zona = cloudflare.data?.dominio;
    if (conta && zona) {
      return `https://dash.cloudflare.com/${conta}/${zona}/dns/records?search=${encodeURIComponent(host)}`;
    }
    return "https://dash.cloudflare.com/";
  };

  const linkLovable = (host: string) =>
    `https://lovable.dev/projects/39b1da47-cdc6-44f9-86c6-8cf9e1e4fbad/settings/domains?domain=${encodeURIComponent(host)}`;

  const abrirLovable = (host: string) => {
    const janela = window.open(linkLovable(host), "_blank", "noopener");
    if (!janela) {
      toast.info("Abra as configurações de domínios para concluir a conexão", {
        description: linkLovable(host),
      });
    }
  };

  const abrirCloudflare = (host: string) => {
    const janela = window.open(linkCloudflare(host), "_blank", "noopener");
    if (!janela) {
      toast.info("Abra a Cloudflare para conferir o endereço", {
        description: linkCloudflare(host),
      });
    }
  };

  const conferirEndereco = async (host: string) => {
    setStatusEnderecos((p) => ({ ...p, [host]: { estado: "verificando", detalhe: "" } }));
    try {
      const r: any = await checkDomainFn({ data: { host } });
      setStatusEnderecos((p) => ({
        ...p,
        [host]: {
          estado: r?.publicado ? "ativo" : "inativo",
          detalhe: r?.publicado
            ? `${r.tipo} apontando para ${r.apontaPara}${r.viaCuringa ? " (pelo curinga)" : ""}`
            : "Ainda não publicado na Cloudflare",
        },
      }));
      return Boolean(r?.publicado);
    } catch (e: any) {
      setStatusEnderecos((p) => ({
        ...p,
        [host]: { estado: "inativo", detalhe: e?.message ?? "Não foi possível verificar" },
      }));
      return false;
    }
  };

  // Assim que o painel abre, cada endereço das franquias é conferido na
  // Cloudflare para mostrar sozinho se está ativo ou não.
  const jaConferidos = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!cloudflare.data?.conectado) return;
    const hosts: string[] = (projects.data ?? [])
      .flatMap((p: any) => p.project_domains ?? [])
      .map((d: any) => String(d.domain))
      .filter((h: string) => h && !jaConferidos.current.has(h));
    if (hosts.length === 0) return;
    hosts.forEach((h) => jaConferidos.current.add(h));
    void (async () => {
      for (const host of hosts) await conferirEndereco(host);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data, cloudflare.data?.conectado]);



  const definirPrincipal = useMutation({
    mutationFn: (id: string) => definirPrincipalFn({ data: { id } }),
    onSuccess: (r: any) => {
      toast.success("Painel principal atualizado", { description: r?.domain });
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível alterar", { description: e.message }),
  });

  const checkDomain = useMutation({
    mutationFn: () => {
      if (!cfCheck.trim()) throw new Error("Informe o domínio ou subdomínio.");
      return checkDomainFn({ data: { host: cfCheck.trim() } });
    },
    onSuccess: (r: any) =>
      r?.publicado
        ? toast.success(`${r.host} está validado`, {
            description: `${r.tipo} apontando para ${r.apontaPara}${r.viaCuringa ? " (pelo curinga)" : ""}`,
          })
        : toast.warning(`${r?.host} ainda não está publicado na Cloudflare`),
    onError: (e: Error) => toast.error("Não foi possível verificar", { description: e.message }),
  });


  const connectCloudflare = useMutation({
    mutationFn: () => {
      if (!baseDomain.trim()) throw new Error("Informe o domínio base antes de conectar.");
      return connectCloudflareFn({
        data: {
          modo: cfMode,
          apiToken: cfToken.trim(),
          email: cfEmail.trim(),
          globalApiKey: cfGlobalKey.trim(),
          accountId: cfAccountId.trim(),
          baseDomain: baseDomain.trim(),
          targetIp: cfTargetIp.trim() || "185.158.133.1",
          proxied: cfProxied,
        },
      });
    },

    onSuccess: (r: any) => {
      setCfToken("");
      toast.success("Cloudflare conectada", {
        description: `Domínio ${r?.dominio} validado e endereços curinga criados.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["cloudflare-status"] });
      void queryClient.invalidateQueries({ queryKey: ["franchise-settings"] });
    },
    onError: (e: Error) => toast.error("Não foi possível conectar", { description: e.message }),
  });

  const disconnectCloudflare = useMutation({
    mutationFn: () => disconnectCloudflareFn({}),
    onSuccess: () => {
      toast.success("Cloudflare desconectada");
      void queryClient.invalidateQueries({ queryKey: ["cloudflare-status"] });
    },
    onError: (e: Error) => toast.error("Não foi possível desconectar", { description: e.message }),
  });


  useEffect(() => {
    if (settings.data) setBaseDomain(settings.data.baseDomain ?? "");
  }, [settings.data]);

  useEffect(() => {
    if (search.tab === "nova") {
      setForm({ ...EMPTY });
      nameRef.current?.focus();
    }
  }, [search.tab]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project-branding"] });
  };

  const saveSettings = useMutation({
    mutationFn: () => saveSettingsFn({ data: { baseDomain } }),
    onSuccess: () => {
      toast.success("Endereço base salvo");
      void queryClient.invalidateQueries({ queryKey: ["franchise-settings"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const save = useMutation({
    mutationFn: () => {
      const name = form.name.trim();
      const slug = slugify(form.slug.trim() || name);
      const subdominio = slugify(form.subdominio.trim() || slug);
      if (!name) throw new Error("Informe o nome da franquia.");
      if (!slug) throw new Error("Informe um identificador com letras ou números.");
      if (!form.id && form.criarSubdominio && !baseDomain.trim()) {
        throw new Error("Defina o domínio base antes de criar o subdomínio da franquia.");
      }
      return saveFn({ data: { ...form, name, slug, subdominio } });
    },
    onSuccess: (result: any) => {
      if (form.id) {
        toast.success("Franquia atualizada");
      } else if (result?.generatedDomain) {
        toast.success("Franquia criada", {
          description: `Endereço de acesso: ${result.generatedDomain}`,
        });
        if (result?.adminEmail) {
          toast.info("Acesso da franquia", {
            duration: 60000,
            description: `Login: ${result.adminEmail} — Senha: ${result.adminSenha} (anote agora)`,
          });
        }
        if (cloudflare.data?.conectado) {
          const host = String(result.generatedDomain);
          setStatusEnderecos((p) => ({
            ...p,
            [host]: { estado: "verificando", detalhe: "" },
          }));
          abrirCloudflare(host);
          void publishDomainFn({ data: { domain: host } })
            .then(async () => {
              toast.success("Endereço publicado na Cloudflare", {
                description: "Abrimos a Cloudflare para você conferir o registro.",
              });
              const ativo = await conferirEndereco(host);
              abrirLovable(host);
              toast.info("Conclua a conexão do endereço", {
                duration: 20000,
                description: `Abrimos a tela de domínios para ligar ${host} ao sistema.`,
              });
              if (ativo) toast.success(`${host} está ativo`);
              else
                toast.warning(`${host} ainda não aparece ativo`, {
                  description: "Confira na Cloudflare e use o botão Verificar.",
                });
            })
            .catch((e: Error) => {
              setStatusEnderecos((p) => ({
                ...p,
                [host]: { estado: "inativo", detalhe: e.message },
              }));
              toast.error("Endereço não publicado na Cloudflare", { description: e.message });
            });
        }


      } else {
        toast.success("Franquia criada", {
          description: form.criarSubdominio
            ? "Defina o endereço base para gerar o acesso automático."
            : "Você pode gerar o endereço da franquia depois, na lista abaixo.",
        });
      }
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Franquia removida");
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const addDomain = useMutation({
    mutationFn: (vars: { projectId: string; domain: string; accessKey?: string }) =>
      addDomainFn({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success("Domínio próprio conectado");
      setDomainInput((prev) => ({ ...prev, [vars.projectId]: "" }));
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível conectar", { description: e.message }),
  });

  const removeDomain = useMutation({
    mutationFn: (id: string) => removeDomainFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Domínio removido");
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  if (loading) {
    return <div className="p-3 text-sm text-muted-foreground sm:p-6">Carregando…</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Apenas o superadmin pode criar e gerenciar as franquias.
        </p>
      </div>
    );
  }

  const previewSlug = slugify(form.subdominio.trim() || form.slug.trim() || form.name.trim());
  const previewDomain = previewSlug && baseDomain ? `${previewSlug}.${baseDomain}` : "";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Franquias</h1>
        <p className="text-sm text-muted-foreground">
          Cada franquia usa o mesmo layout e as mesmas APIs cadastradas em “API de conexão”. Ao
          criar, geramos um endereço de acesso automático — e você pode conectar um domínio próprio
          depois.
        </p>
      </header>

      {(() => {
        const lista = (projects.data as any[] | undefined) ?? [];
        const central = lista.find((p) => p.is_central);
        const todos = lista.flatMap((p: any) =>
          (p.project_domains ?? []).map((d: any) => ({
            id: d.id as string,
            domain: d.domain as string,
            is_primary: Boolean(d.is_primary),
            projeto: p.name as string,
          })),
        );
        const atual =
          todos.find((d) => d.is_primary) ??
          todos.find((d) => d.domain === central?.project_domains?.[0]?.domain);
        const painel = atual?.domain ?? "";
        if (!painel) return null;
        return (
          <section className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">Painel principal</h2>
                <p className="text-sm text-muted-foreground">
                  Endereço oficial do painel administrativo. É por ele que você cria e gerencia os
                  endereços das franquias.
                </p>
              </div>
              <Badge variant="secondary">Principal</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                className="text-sm font-medium text-primary underline underline-offset-4"
                href={`https://${painel}`}
                target="_blank"
                rel="noreferrer"
              >
                {painel}
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`https://${painel}`);
                  toast.success("Endereço copiado");
                }}
              >
                <Copy className="mr-1.5 size-4" /> Copiar
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-primary/20 pt-3">
              <div className="min-w-56 flex-1 space-y-2">
                <Label>Alterar painel principal</Label>
                <Select
                  value={novoPrincipal || atual?.id || ""}
                  onValueChange={setNovoPrincipal}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o endereço" />
                  </SelectTrigger>
                  <SelectContent>
                    {todos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.domain} — {d.projeto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={() => {
                  const alvo = novoPrincipal || atual?.id || "";
                  if (!alvo) return;
                  if (alvo === atual?.id) {
                    toast.info("Este endereço já é o painel principal");
                    return;
                  }
                  definirPrincipal.mutate(alvo);
                }}
                disabled={definirPrincipal.isPending}
              >
                <Save className="mr-1.5 size-4" />
                {definirPrincipal.isPending ? "Salvando…" : "Definir como principal"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Isso muda o painel principal dentro do sistema. Nas configurações de domínios do
              projeto o redirecionamento continua como está.
            </p>
          </section>
        );
      })()}



      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Endereço base das franquias</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-2">
            <Label htmlFor="baseDomain">Domínio base</Label>
            <Input
              id="baseDomain"
              value={baseDomain}
              onChange={(e) => setBaseDomain(e.target.value)}
              placeholder="minhamarca.com.br"
            />
          </div>
          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            <Save className="mr-1.5 size-4" /> Salvar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada franquia nova recebe um endereço no formato identificador.{baseDomain || "seudominio.com"}.
        </p>

        <div className="space-y-3 rounded-md border border-dashed border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">Credenciais da Cloudflare</h3>
            {cloudflare.data?.conectado ? (
              <Badge variant="secondary">Validado: {cloudflare.data.dominio}</Badge>
            ) : (
              <Badge variant="outline">Não conectado</Badge>
            )}
          </div>

          <div className="space-y-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Como conectar</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>
                Tenha o domínio base adicionado na sua conta Cloudflare.
              </li>
              <li>
                Crie um token de API em{" "}
                <em>Meu perfil → Tokens de API → Criar token</em>, usando as permissões{" "}
                <em>Zone:Read</em> e <em>DNS:Edit</em> para todas as zonas ou apenas para este
                domínio.
              </li>
              <li>
                O ID da conta aparece no lado direito do painel da zona, em{" "}
                <em>Visão geral da zona</em>.
              </li>
              <li>
                Cole o token abaixo e clique em <em>Validar e conectar</em>.
              </li>
            </ol>
            <p>
              Ao conectar, verificamos o domínio e criamos o registro raiz e o curinga{" "}
              <code className="rounded bg-background px-1 py-0.5">
                *.{baseDomain || "seudominio.com"}
              </code>
              , liberando qualquer subdomínio de franquia.
            </p>
          </div>


          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44 space-y-2">
              <Label>Tipo de credencial</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={cfMode}
                onChange={(e) => setCfMode(e.target.value as "token" | "global")}
              >
                <option value="token">Token de API</option>
                <option value="global">E-mail + chave global</option>
              </select>
            </div>

            {cfMode === "token" ? (
              <div className="min-w-56 flex-1 space-y-2">
                <Label htmlFor="cfToken">Token da Cloudflare</Label>
                <Input
                  id="cfToken"
                  type="password"
                  value={cfToken}
                  onChange={(e) => setCfToken(e.target.value)}
                  placeholder={
                    cloudflare.data?.conectado ? "Token salvo — cole outro para trocar" : "Cole o token"
                  }
                />
              </div>
            ) : (
              <>
                <div className="min-w-48 flex-1 space-y-2">
                  <Label htmlFor="cfEmail">E-mail da conta</Label>
                  <Input
                    id="cfEmail"
                    value={cfEmail}
                    onChange={(e) => setCfEmail(e.target.value)}
                    placeholder="voce@email.com"
                  />
                </div>
                <div className="min-w-48 flex-1 space-y-2">
                  <Label htmlFor="cfKey">Chave global</Label>
                  <Input
                    id="cfKey"
                    type="password"
                    value={cfGlobalKey}
                    onChange={(e) => setCfGlobalKey(e.target.value)}
                    placeholder="Global API Key"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56 space-y-2">
              <Label htmlFor="cfAccount">ID da conta (opcional)</Label>
              <Input
                id="cfAccount"
                value={cfAccountId}
                onChange={(e) => setCfAccountId(e.target.value)}
                placeholder="Account ID"
              />
            </div>
            <div className="w-44 space-y-2">
              <Label htmlFor="cfIp">Apontar para (IP)</Label>
              <Input
                id="cfIp"
                value={cfTargetIp}
                onChange={(e) => setCfTargetIp(e.target.value)}
                placeholder="185.158.133.1"
              />
            </div>
            <label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={cfProxied}
                onChange={(e) => setCfProxied(e.target.checked)}
              />
              Passar pelo proxy da Cloudflare
            </label>
            <Button onClick={() => connectCloudflare.mutate()} disabled={connectCloudflare.isPending}>
              <Globe className="mr-1.5 size-4" /> Validar e conectar
            </Button>
            {cloudflare.data?.conectado && (
              <Button
                variant="outline"
                onClick={() => disconnectCloudflare.mutate()}
                disabled={disconnectCloudflare.isPending}
              >
                Desconectar
              </Button>
            )}
          </div>

          {cloudflare.data?.conectado && (
            <>
              <p className="text-xs text-muted-foreground">
                Registros apontando para {cloudflare.data.apontaPara}
                {cloudflare.data.contaId ? ` · conta ${cloudflare.data.contaId}` : ""}
                {cloudflare.data.zonaId ? ` · zona ${cloudflare.data.zonaId}` : ""}. Endereços novos
                são publicados automaticamente ao criar uma franquia.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1 space-y-2">
                  <Label htmlFor="cfCheck">Verificar domínio ou subdomínio</Label>
                  <Input
                    id="cfCheck"
                    value={cfCheck}
                    onChange={(e) => setCfCheck(e.target.value)}
                    placeholder={`franquia.${cloudflare.data.dominio}`}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => checkDomain.mutate()}
                  disabled={checkDomain.isPending}
                >
                  Verificar
                </Button>
              </div>
            </>
          )}
        </div>

      </section>


      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">
          {form.id ? "Editar franquia" : "Nova franquia"}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da franquia</Label>
            <Input
              id="name"
              ref={nameRef}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Franquia Goiânia"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Identificador</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="goiania"
            />
          </div>
          {!form.id && (
            <div className="space-y-2 md:col-span-2 rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="criarSubdominio">Criar subdomínio no domínio base</Label>
                  <p className="text-xs text-muted-foreground">
                    Gera uma página própria da franquia usando a mesma base de dados, o mesmo
                    sistema e as mesmas conexões já cadastradas.
                  </p>
                </div>
                <Switch
                  id="criarSubdominio"
                  checked={form.criarSubdominio}
                  onCheckedChange={(v) => setForm({ ...form, criarSubdominio: v })}
                />
              </div>
              {form.criarSubdominio && (
                <div className="space-y-2">
                  <Label htmlFor="subdominio">Endereço da franquia</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="subdominio"
                      value={form.subdominio}
                      onChange={(e) =>
                        setForm({ ...form, subdominio: e.target.value.toLowerCase() })
                      }
                      placeholder={slugify(form.slug.trim() || form.name.trim()) || "goiania"}
                    />
                    <span className="shrink-0 text-sm text-muted-foreground">
                      .{baseDomain || "seudominio.com"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {previewDomain
                      ? `Endereço gerado: ${previewDomain}`
                      : "Defina o endereço base acima para gerar o acesso automático."}
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="domain">Domínio próprio (opcional)</Label>
            <Input
              id="domain"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="genesis ou dominiodafranquia.com"
            />
            <p className="text-xs text-muted-foreground">
              Digite só o nome (ex.: genesis) e o sistema completa com o domínio base automaticamente.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="accessKey">Chave de vínculo</Label>
            <div className="flex gap-2">
              <Input
                id="accessKey"
                value={form.accessKey}
                onChange={(e) => setForm({ ...form, accessKey: e.target.value })}
                placeholder="Gere ou informe a chave"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Gerar nova chave"
                onClick={() => setForm({ ...form, accessKey: newAccessKey() })}
              >
                <KeyRound className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Copiar chave"
                disabled={!form.accessKey}
                onClick={() => {
                  void navigator.clipboard.writeText(form.accessKey);
                  toast.success("Chave copiada");
                }}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A chave liga o domínio a esta franquia. Se ficar em branco, criamos uma
              automaticamente.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="headline">Título exibido</Label>
            <Input
              id="headline"
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder="Central da Franquia Goiânia"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Subtítulo</Label>
            <Input
              id="tagline"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="Multi atendimento"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Endereço da logo</Label>
            <Input
              id="logoUrl"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="faviconUrl">Endereço do ícone (favicon)</Label>
            <Input
              id="faviconUrl"
              value={form.faviconUrl}
              onChange={(e) => setForm({ ...form, faviconUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Cor principal</Label>
            <Input
              id="primaryColor"
              value={form.primaryColor}
              onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accentColor">Cor de destaque</Label>
            <Input
              id="accentColor"
              value={form.accentColor}
              onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="isActive"
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v })}
          />
          <Label htmlFor="isActive">Franquia ativa</Label>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1.5 size-4" /> {form.id ? "Salvar alterações" : "Criar franquia"}
          </Button>
          {form.id && (
            <Button variant="outline" onClick={() => setForm(EMPTY)}>
              Cancelar
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Franquias conectadas</h2>
        {(projects.data ?? []).map((project: any) => (
          <div key={project.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-4 rounded-full border border-border"
                  style={{ background: project.primary_color }}
                />
                <span className="font-medium text-foreground">{project.name}</span>
                {project.is_central && <Badge>Central</Badge>}
                <Badge variant={project.is_active ? "default" : "secondary"}>
                  {project.is_active ? "Ativa" : "Inativa"}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      id: project.id,
                      name: project.name,
                      slug: project.slug,
                      accessKey: project.access_key ?? "",
                      domain: "",
                      criarSubdominio: false,
                      subdominio: "",
                      isActive: project.is_active,
                      logoUrl: project.logo_url ?? "",
                      faviconUrl: project.favicon_url ?? "",
                      primaryColor: project.primary_color,
                      accentColor: project.accent_color,
                      headline: project.headline,
                      tagline: project.tagline,
                    })
                  }
                >
                  Editar
                </Button>
                {!project.is_central && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(project.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <KeyRound className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Chave de vínculo:</span>
              <code className="font-mono text-xs text-foreground">{project.access_key}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(project.access_key ?? "");
                  toast.success("Chave copiada");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>

            <ul className="space-y-1">
              {(project.project_domains ?? []).map((d: any) => {
                const st = statusEnderecos[d.domain];
                return (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="size-3.5" /> {d.domain}
                    {d.is_primary && <Badge variant="secondary">Acesso gerado</Badge>}
                    {st?.estado === "verificando" && <Badge variant="outline">Verificando…</Badge>}
                    {st?.estado === "ativo" && (
                      <Badge variant="secondary" title={st.detalhe}>
                        Ativo na Cloudflare
                      </Badge>
                    )}
                    {st?.estado === "inativo" && (
                      <Badge variant="destructive" title={st.detalhe}>
                        Não ativo
                      </Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void conferirEndereco(d.domain)}
                      disabled={st?.estado === "verificando"}
                    >
                      Verificar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => abrirLovable(d.domain)}
                      title="Conectar este endereço ao sistema"
                    >
                      Conectar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => abrirCloudflare(d.domain)}
                      title="Abrir na Cloudflare"
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(`https://${d.domain}`);
                        toast.success("Endereço copiado");
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeDomain.mutate(d.id)}>
                      Remover
                    </Button>
                  </div>
                </li>
                );
              })}

              {(project.project_domains ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhum endereço vinculado ainda.</li>
              )}
            </ul>

            {project.admin_email && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <UserCog className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Login de acesso:</span>
                <code className="font-mono text-xs text-foreground">{project.admin_email}</code>
                {project.admin_password && (
                  <>
                    <span className="text-muted-foreground">Senha:</span>
                    <code className="font-mono text-xs text-foreground">{project.admin_password}</code>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      project.admin_password
                        ? `Login: ${project.admin_email} | Senha: ${project.admin_password}`
                        : `Login: ${project.admin_email}`,
                    );
                    toast.success("Login copiado");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                placeholder="Conectar domínio próprio: dominiodafranquia.com"
                value={domainInput[project.id] ?? ""}
                onChange={(e) =>
                  setDomainInput((prev) => ({ ...prev, [project.id]: e.target.value }))
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const value = (domainInput[project.id] ?? "").trim();
                  if (value.length < 3 || !value.includes(".")) {
                    toast.error("Informe um domínio válido, como dominiodafranquia.com");
                    return;
                  }
                  addDomain.mutate({
                    projectId: project.id,
                    domain: value,
                    accessKey: project.access_key ?? "",
                  });
                }}
                disabled={addDomain.isPending || (domainInput[project.id] ?? "").trim().length < 3}
              >
                <Plus className="mr-1.5 size-4" /> Conectar
              </Button>

            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        As APIs de WhatsApp, IA, notas fiscais e demais integrações ficam somente aqui, na central.
        Qualquer alteração feita em “API de conexão” passa a valer na hora para todas as franquias.
      </section>
    </div>
  );
}

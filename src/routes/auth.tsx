import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Headset, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectBranding } from "@/hooks/use-project";
import videoPaiAsset from "@/assets/video-pai.mp4.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar no NXS MULTI ATENDIMENTO" },
      {
        name: "description",
        content:
          "Acesse o NXS MULTI ATENDIMENTO para responder conversas, gerenciar filas e transferir atendimentos.",
      },
      { property: "og:title", content: "Entrar no NXS MULTI ATENDIMENTO" },
      {
        property: "og:description",
        content: "Acesse o NXS MULTI ATENDIMENTO da sua equipe.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { project } = useProjectBranding();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let ativo = true;
    // Confirma a sessão com o servidor. Um acesso antigo guardado no navegador
    // fazia a tela entrar em vai-e-vem com o atendimento, recarregando sem
    // parar e apagando o que estava sendo digitado.
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!ativo) return;
      if (data?.user && !error) {
        navigate({ to: "/atendimento", replace: true });
        return;
      }
      const { data: local } = await supabase.auth.getSession();
      if (local.session) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    })();
    return () => {
      ativo = false;
    };
  }, [navigate]);

  function toLoginEmail(value: string) {
    const trimmed = value.trim();
    if (trimmed.includes("@")) return trimmed.toLowerCase();
    return `${trimmed.toLowerCase().replace(/[^a-z0-9._-]/g, "")}@nxs.local`;
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(email),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    navigate({ to: "/atendimento", replace: true });
  }


  const fieldClass =
    "h-12 rounded-xl border-border/60 bg-background/40 px-4 text-foreground backdrop-blur-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/60";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Vídeo de fundo */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 size-full object-cover"
        src={videoPaiAsset.url}
      />
      <div className="pointer-events-none absolute inset-0 bg-black/45" />


      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl border border-border/50 bg-card/60 p-8 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col items-center gap-3 text-center">
            {project?.loginLogoUrl ? (
              <img
                src={project.loginLogoUrl}
                alt={project.name}
                className="h-20 w-auto max-w-64 object-contain sm:h-24"
              />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary">
                <Headset className="size-7" />
              </span>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {project?.headline || project?.name || "NXS MULTI ATENDIMENTO"}
            </h1>
            <p className="text-sm text-muted-foreground">Sua central de atendimento</p>
          </div>

          <form onSubmit={signIn} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">
                Usuário ou e-mail
              </Label>
              <Input
                id="email"
                type="text"
                autoCapitalize="none"
                autoComplete="username"
                placeholder="lucasdallan"
                required
                className={fieldClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha" className="text-muted-foreground">
                Senha
              </Label>
              <Input
                id="senha"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={fieldClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/25"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Entrar
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              As contas são criadas pelo administrador na tela de Equipe.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // A sessão só existe no navegador (localStorage). Ir direto para /auth evita
    // a tela preta da rota /atendimento (ssr:false) enquanto a sessão é lida;
    // a página de login redireciona para /atendimento quando já há sessão.
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});

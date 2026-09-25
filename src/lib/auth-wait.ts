import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";

/** Aguarda a sessão (carregando ou renovando) antes de enviar pedidos protegidos. */
async function tokenAtual(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  for (let i = 0; i < 20; i++) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return token;
    if (i === 3) {
      try {
        const r = await supabase.auth.refreshSession();
        if (r.data.session?.access_token) return r.data.session.access_token;
      } catch {
        /* segue aguardando */
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return undefined;
}

export const waitSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = await tokenAtual();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

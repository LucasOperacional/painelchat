import { createFileRoute } from "@tanstack/react-router";

/**
 * Catálogo público da loja: categorias ativas do estoque com a quantidade de
 * logins disponíveis. Não expõe nenhum login nem senha — apenas o que o
 * cliente precisa ver para escolher o produto.
 */
export const Route = createFileRoute("/api/public/loja")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: cats, error }, { data: itens }, { data: conexoes }] = await Promise.all([
          supabaseAdmin
            .from("estoque_categorias")
            .select("id, nome, descricao, preco, ativo")
            .eq("ativo", true)
            .order("nome", { ascending: true }),
          supabaseAdmin.from("estoque_itens").select("categoria_id, status").eq("status", "disponivel"),
          supabaseAdmin
            .from("whatsapp_config")
            .select("phone, is_default, status")
            .order("is_default", { ascending: false }),
        ]);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const disponiveis = new Map<string, number>();
        for (const item of (itens ?? []) as { categoria_id: string }[]) {
          disponiveis.set(item.categoria_id, (disponiveis.get(item.categoria_id) ?? 0) + 1);
        }

        const whatsapp =
          ((conexoes ?? []) as { phone: string | null; status: string | null }[]).find(
            (c) => (c.phone ?? "").replace(/\D/g, "").length >= 10,
          )?.phone ?? "";

        const produtos = ((cats ?? []) as Record<string, unknown>[]).map((c) => ({
          id: String(c["id"] ?? ""),
          nome: String(c["nome"] ?? ""),
          descricao: String(c["descricao"] ?? ""),
          preco: Number(c["preco"] ?? 0),
          disponiveis: disponiveis.get(String(c["id"] ?? "")) ?? 0,
        }));

        return new Response(JSON.stringify({ produtos, whatsapp: whatsapp.replace(/\D/g, "") }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});

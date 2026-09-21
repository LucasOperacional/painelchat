// Banco interno da central: carteira com entradas (Pix recebidos) e saídas
// (Pix enviados pela MisticPay). Envio é restrito a administradores.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BankTransaction = {
  id: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  status: string;
  pix_key: string;
  pix_key_type: string;
  receiver_name: string;
  provider: string;
  transaction_id: string | null;
  error_message: string | null;
  paid_at: string | null;
  created_at: string;
};

export type BankOverview = {
  isAdmin: boolean;
  totalIn: number;
  totalOut: number;
  balance: number;
  gatewayBalance: number | null;
  gatewayError: string | null;
  transactions: BankTransaction[];
};

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Apenas administradores podem enviar Pix.");
}

/** Saldo da carteira + últimas movimentações. */
export const getBankOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BankOverview> => {
    const { data: adminFlag } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: totals }, { data: rows }] = await Promise.all([
      supabaseAdmin.rpc("bank_balance"),
      supabaseAdmin
        .from("bank_transactions")
        .select(
          "id, direction, amount, description, status, pix_key, pix_key_type, receiver_name, provider, transaction_id, error_message, paid_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const totalsRow = (Array.isArray(totals) ? totals[0] : totals) as
      | { total_in: number | string; total_out: number | string; balance: number | string }
      | null;

    let gatewayBalance: number | null = null;
    let gatewayError: string | null = null;
    try {
      const { misticpayBalance } = await import("@/lib/misticpay.server");
      gatewayBalance = await misticpayBalance();
    } catch (error) {
      gatewayError = (error as Error).message;
    }

    return {
      isAdmin: !!adminFlag,
      totalIn: Number(totalsRow?.total_in ?? 0),
      totalOut: Number(totalsRow?.total_out ?? 0),
      balance: Number(totalsRow?.balance ?? 0),
      gatewayBalance,
      gatewayError,
      transactions: ((rows ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          ...(r as unknown as BankTransaction),
          amount: Number(r["amount"] ?? 0),
        };
      }),
    };
  });

const payoutSchema = z.object({
  amount: z.number().positive("Informe o valor do Pix"),
  pixKey: z.string().trim().min(3, "Informe a chave Pix").max(140),
  pixKeyType: z.enum(["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM"]),
  receiverName: z.string().trim().max(80).default(""),
  description: z.string().trim().max(140).default("Pagamento"),
});

/** Envia um Pix pela MisticPay e registra a saída na carteira. */
export const sendPixPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => payoutSchema.parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pixKey =
      data.pixKeyType === "CPF" || data.pixKeyType === "CNPJ" || data.pixKeyType === "PHONE"
        ? data.pixKey.replace(/\D/g, "")
        : data.pixKey;

    const { data: row, error } = await supabaseAdmin
      .from("bank_transactions")
      .insert({
        direction: "out",
        amount: data.amount,
        description: data.description || "Pagamento",
        status: "processando",
        pix_key: pixKey,
        pix_key_type: data.pixKeyType,
        receiver_name: data.receiverName,
        provider: "misticpay",
        requested_by: context.userId,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    try {
      const { misticpayWithdraw } = await import("@/lib/misticpay.server");
      const result = await misticpayWithdraw({
        amount: data.amount,
        pixKey,
        pixKeyType: data.pixKeyType,
        description: data.description || "Pagamento",
      });
      await supabaseAdmin
        .from("bank_transactions")
        .update({
          transaction_id: result.transactionId || null,
          status: /conclu|pago|paid|success/i.test(result.status) ? "pago" : "processando",
          ...(/conclu|pago|paid|success/i.test(result.status)
            ? { paid_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", row.id);
      return { ok: true, id: row.id, status: result.status, message: result.message };
    } catch (err) {
      const message = (err as Error).message;
      await supabaseAdmin
        .from("bank_transactions")
        .update({ status: "falhou", error_message: message })
        .eq("id", row.id);
      throw new Error(message);
    }
  });

/** Reconsulta na MisticPay o status das saídas ainda em processamento. */
export const refreshBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { misticpayCheckCharge, misticpayTransactionStatus } = await import(
      "@/lib/misticpay.server"
    );
    const { isPaidStatus } = await import("@/lib/pix-confirm.server");

    const { data: rows } = await supabaseAdmin
      .from("bank_transactions")
      .select("id, transaction_id")
      .eq("direction", "out")
      .eq("provider", "misticpay")
      .eq("status", "processando")
      .not("transaction_id", "is", null)
      .limit(30);

    let updated = 0;
    for (const row of rows ?? []) {
      try {
        const res = await misticpayCheckCharge(String(row.transaction_id));
        const status = misticpayTransactionStatus(res);
        if (isPaidStatus(status)) {
          await supabaseAdmin
            .from("bank_transactions")
            .update({ status: "pago", paid_at: new Date().toISOString() })
            .eq("id", row.id);
          updated++;
        } else if (/fail|falh|error|recus|cancel|estorn/i.test(status)) {
          await supabaseAdmin
            .from("bank_transactions")
            .update({ status: "falhou", error_message: status })
            .eq("id", row.id);
          updated++;
        }
      } catch {
        /* tenta de novo na próxima atualização */
      }
    }
    return { updated };
  });

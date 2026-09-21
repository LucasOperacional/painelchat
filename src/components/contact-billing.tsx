import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { useState } from "react";

import { resumoContato } from "@/lib/cobrancas.functions";
import { Button } from "@/components/ui/button";

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(valor: string) {
  if (!valor) return "—";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor;
}

export function ContactBilling({ telefone, nome }: { telefone: string; nome: string }) {
  const buscar = useServerFn(resumoContato);
  const [verSenha, setVerSenha] = useState<string | null>(null);

  const resumo = useQuery({
    queryKey: ["contato-cobrancas", telefone, nome],
    enabled: Boolean(telefone || nome),
    queryFn: () => buscar({ data: { telefone, nome } }),
  });

  const cobrancas = resumo.data?.cobrancas ?? [];
  const acessos = resumo.data?.acessos ?? [];

  return (
    <>
      <div className="rounded-[8px] border border-border p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Cobranças agendadas
        </p>
        <ul className="mt-2 space-y-2">
          {resumo.isLoading && <li className="text-xs text-muted-foreground">Carregando…</li>}
          {!resumo.isLoading && cobrancas.length === 0 && (
            <li className="text-xs text-muted-foreground">Nenhuma cobrança para este contato.</li>
          )}
          {cobrancas.map((c) => (
            <li key={c.id} className="rounded-md border border-border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium text-foreground">{c.descricao || "Cobrança"}</p>
                <span className="shrink-0 text-foreground">{moeda(c.valor)}</span>
              </div>
              <p className="mt-1 text-muted-foreground">Vence em {dataBr(c.vencimento)}</p>
              <p className="text-muted-foreground">
                {c.ativo
                  ? c.proximoEnvio
                    ? `Próximo aviso: ${new Date(c.proximoEnvio).toLocaleString("pt-BR")}`
                    : "Envio automático ligado"
                  : "Envio automático desligado"}
              </p>
              {c.boletoUrl && (
                <a
                  href={c.boletoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="size-3" /> Abrir boleto
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>

      {resumo.data?.ehAdmin && (
        <div className="rounded-[8px] border border-border p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Acessos salvos
          </p>
          <ul className="mt-2 space-y-2">
            {!resumo.isLoading && acessos.length === 0 && (
              <li className="text-xs text-muted-foreground">Nenhum acesso salvo para este contato.</li>
            )}
            {acessos.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-2 text-xs">
                <p className="truncate font-medium text-foreground">{a.titulo}</p>
                {a.url && (
                  <a
                    href={a.url.startsWith("http") ? a.url : `https://${a.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" /> {a.url}
                  </a>
                )}
                {a.login && <p className="mt-1 text-muted-foreground">Login: {a.login}</p>}
                {a.senha && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-muted-foreground">
                      Senha: {verSenha === a.id ? a.senha : "••••••••"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      title={verSenha === a.id ? "Esconder senha" : "Mostrar senha"}
                      onClick={() => setVerSenha(verSenha === a.id ? null : a.id)}
                    >
                      {verSenha === a.id ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </Button>
                  </div>
                )}
                {a.vencimento && (
                  <p className="text-muted-foreground">Vence em {dataBr(a.vencimento)}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

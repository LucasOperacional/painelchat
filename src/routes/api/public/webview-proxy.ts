import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy de leitura/escrita para o Webview.
 *
 * Muitos sites enviam cabeçalhos (X-Frame-Options / CSP frame-ancestors) que
 * impedem serem abertos dentro de outra página. Aqui o servidor busca o site,
 * resolve o DNS/TLS do domínio e devolve o conteúdo sem esses bloqueios.
 *
 * Os links, imagens, scripts e formulários do mesmo domínio são reescritos para
 * passarem por este proxy, e os cookies da sessão do site são repassados nos
 * dois sentidos (limitados ao caminho deste endpoint).
 *
 * Só funciona com sites já cadastrados na tabela `webviews` — o parâmetro `u`
 * precisa apontar para o mesmo domínio do site cadastrado.
 */

const PROXY_PATH = "/api/public/webview-proxy";

/** Bloqueia endereços internos (rede local, loopback, metadados de nuvem). */
function enderecoInterno(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function proxyUrl(id: string, absolute: string) {
  return `${PROXY_PATH}?id=${encodeURIComponent(id)}&u=${encodeURIComponent(absolute)}`;
}

function rewriteHtml(html: string, id: string, target: URL) {
  // Remove meta-tags de CSP que bloqueiam a exibição embutida.
  let out = html.replace(
    /<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi,
    "",
  );
  // Remove <base> do próprio site para não atrapalhar a reescrita.
  out = out.replace(/<base[^>]*>/gi, "");

  out = out.replace(
    /(\s(?:src|href|action|poster|data-src)\s*=\s*)(["'])([^"']*)\2/gi,
    (match, prefix: string, quote: string, value: string) => {
      const raw = value.trim();
      if (!raw || /^(data:|javascript:|mailto:|tel:|blob:|#)/i.test(raw)) return match;
      let abs: URL;
      try {
        abs = new URL(raw, target);
      } catch {
        return match;
      }
      if (abs.hostname !== target.hostname) return match;
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return match;
      return `${prefix}${quote}${proxyUrl(id, abs.toString())}${quote}`;
    },
  );

  return out;
}

async function handle(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Site inválido.", { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("webviews")
    .select("url")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return new Response("Site não encontrado.", { status: 404 });

  let target: URL;
  try {
    target = new URL(data.url);
  } catch {
    return new Response("Endereço do site inválido.", { status: 400 });
  }

  const requested = params.get("u");
  if (requested) {
    try {
      const candidate = new URL(requested, target);
      if (candidate.hostname !== target.hostname) {
        return new Response("Endereço fora do site cadastrado.", { status: 403 });
      }
      target = candidate;
    } catch {
      /* mantém a URL cadastrada */
    }
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response("Protocolo não suportado.", { status: 400 });
  }
  if (enderecoInterno(target.hostname)) {
    return new Response("Endereço não permitido.", { status: 403 });
  }

  const forwardHeaders = new Headers({
    "user-agent":
      request.headers.get("user-agent") ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    accept: request.headers.get("accept") ?? "text/html,*/*",
    "accept-language": request.headers.get("accept-language") ?? "pt-BR,pt;q=0.9",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) forwardHeaders.set("cookie", cookie);
  const reqContentType = request.headers.get("content-type");
  if (reqContentType) forwardHeaders.set("content-type", reqContentType);
  if (request.method !== "GET") forwardHeaders.set("referer", target.origin + "/");

  let upstream: Response;
  const corpo =
    request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
  try {
    // Redirecionamentos são seguidos manualmente para não sair do site cadastrado
    // nem alcançar endereços internos.
    let atual = target;
    let resposta: Response | null = null;
    for (let salto = 0; salto < 4; salto += 1) {
      resposta = await fetch(atual.toString(), {
        method: request.method,
        redirect: "manual",
        headers: forwardHeaders,
        body: corpo,
      });
      const location = resposta.headers.get("location");
      if (resposta.status < 300 || resposta.status >= 400 || !location) break;
      const proximo = new URL(location, atual);
      if (
        proximo.hostname !== target.hostname ||
        enderecoInterno(proximo.hostname) ||
        (proximo.protocol !== "http:" && proximo.protocol !== "https:")
      ) {
        return new Response("Endereço fora do site cadastrado.", { status: 403 });
      }
      atual = proximo;
    }
    if (!resposta) throw new Error("sem resposta");
    upstream = resposta;
    target = atual;
  } catch {
    return new Response(
      "Não foi possível acessar o site. Confira o endereço e tente novamente.",
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
  });

  // Repassa os cookies do site, presos ao caminho deste proxy.
  const setCookies =
    typeof (upstream.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
    "function"
      ? (upstream.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : upstream.headers.get("set-cookie")
        ? [upstream.headers.get("set-cookie") as string]
        : [];
  for (const raw of setCookies) {
    const cleaned = raw
      .split(";")
      .filter((part) => !/^\s*(domain|path|secure|samesite)\s*=?/i.test(part))
      .join(";");
    headers.append("set-cookie", `${cleaned}; Path=${PROXY_PATH}; SameSite=None; Secure`);
  }

  // A URL final pode ter mudado por redirecionamento.
  let finalTarget = target;
  try {
    if (upstream.url) finalTarget = new URL(upstream.url);
  } catch {
    /* mantém */
  }

  if (contentType.includes("text/html")) {
    const html = await upstream.text();
    return new Response(rewriteHtml(html, id, finalTarget), {
      status: upstream.status,
      headers,
    });
  }

  if (contentType.includes("text/css")) {
    const css = await upstream.text();
    const rewritten = css.replace(/url\((["']?)([^"')]+)\1\)/gi, (match, quote: string, value: string) => {
      if (/^(data:|#)/i.test(value.trim())) return match;
      try {
        const abs = new URL(value.trim(), finalTarget);
        if (abs.hostname !== finalTarget.hostname) return match;
        return `url(${quote}${proxyUrl(id, abs.toString())}${quote})`;
      } catch {
        return match;
      }
    });
    return new Response(rewritten, { status: upstream.status, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export const Route = createFileRoute("/api/public/webview-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

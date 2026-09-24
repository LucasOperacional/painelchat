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

/**
 * Alguns portais copiam o href já reescrito pelo proxy para parâmetros como
 * `redirectUrl`. Antes de enviar a requisição ao site original, desfazemos
 * somente esses endereços internos. Sem isso, o Emissor Nacional recebe
 * `/api/public/webview-proxy?...` como destino e responde "URL de download
 * inválida" ao tentar gerar o DANFSe/XML.
 */
function unwrapProxyValue(value: string, id: string, allowedHost: string): string {
  if (!value.includes(PROXY_PATH)) return value;
  try {
    const wrapped = new URL(value, "https://proxy.local");
    if (wrapped.pathname !== PROXY_PATH || wrapped.searchParams.get("id") !== id) return value;
    const original = wrapped.searchParams.get("u");
    if (!original) return value;
    const target = new URL(original);
    if (target.hostname !== allowedHost || !/^https?:$/.test(target.protocol)) return value;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return value;
  }
}

function unwrapNestedProxyParams(target: URL, id: string) {
  for (const [key, value] of target.searchParams.entries()) {
    const clean = unwrapProxyValue(value, id, target.hostname);
    if (clean !== value) target.searchParams.set(key, clean);
  }
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
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return match;
      // Links de outros domínios (ex.: gov.br, certificado digital) não abrem
      // embutidos — marcamos para abrir em nova aba.
      if (abs.hostname !== target.hostname) return `${match} data-wv-externo="1"`;
      return `${prefix}${quote}${proxyUrl(id, abs.toString())}${quote}`;
    },
  );

  // Faz chamadas feitas por JavaScript (fetch/XHR) e links externos
  // funcionarem dentro do proxy.
  const shim = `<script>(function(){var P=${JSON.stringify(PROXY_PATH)},I=${JSON.stringify(id)},B=${JSON.stringify(target.toString())},H=${JSON.stringify(target.hostname)};
 function w(u){try{var a=new URL(u,B);if(a.hostname!==H||u.indexOf(P)===0)return u;return P+"?id="+encodeURIComponent(I)+"&u="+encodeURIComponent(a.toString());}catch(e){return u;}}
 var f=window.fetch;if(f)window.fetch=function(i,o){if(typeof i==="string")i=w(i);return f.call(this,i,o);};
 var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=w(String(u));return x.apply(this,arguments);};
 document.addEventListener("click",function(e){var el=e.target&&e.target.closest&&e.target.closest("a[data-wv-externo]");if(el){e.preventDefault();window.open(el.getAttribute("href"),"_blank","noopener");}},true);
 // Downloads gerados por JavaScript (blob/data) não passam pelo proxy: aqui o
 // arquivo é enviado para a central, que guarda e abre a janela de envio.
 document.addEventListener("click",function(e){
  var a=e.target&&e.target.closest&&e.target.closest("a[download]");
  if(!a)return;
  var h=a.getAttribute("href")||"";
  if(h.indexOf("blob:")!==0&&h.indexOf("data:")!==0)return;
  e.preventDefault();e.stopPropagation();
  var n=a.getAttribute("download")||"arquivo";
  fetch(h).then(function(r){return r.blob();}).then(function(b){
   var fd=new FormData();fd.append("arquivo",b,n);fd.append("nome",n);
   return fetch(P+"?id="+encodeURIComponent(I)+"&recebe-arquivo=1",{method:"POST",body:fd});
  }).then(function(r){
   if(r&&r.ok)return r.text().then(function(t){document.open();document.write(t);document.close();});
   throw new Error("falha");
  }).catch(function(){try{window.open(h,"_blank");}catch(_){}});
 },true);
 })();</script>`;
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => m + shim) : shim + out;
  return out;
}

/** Guarda o arquivo na central e devolve a página que abre a janela de envio. */
async function paginaArquivoBaixado(id: string, name: string, mime: string, bytes: Uint8Array) {
  const safe = name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `webview/${id}/${crypto.randomUUID()}-${safe}`;
  let signedUrl: string | null = null;
  if (bytes.byteLength > 0 && bytes.byteLength <= 20 * 1024 * 1024) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("anexos").upload(path, bytes, { contentType: mime });
    if (!up.error) {
      const s = await supabaseAdmin.storage.from("anexos").createSignedUrl(path, 60 * 60 * 24 * 7);
      signedUrl = s.data?.signedUrl ?? null;
    }
  }
  if (!signedUrl) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px"><h3>Não foi possível guardar o arquivo</h3><p>Tente baixar novamente. Se continuar, use a opção de baixar no computador e anexe manualmente na conversa.</p><p><a href="#" onclick="history.back();return false">Voltar ao site</a></p></body>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  const payload = JSON.stringify({ type: "webview-download", url: signedUrl, name, mimeType: mime });
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const page = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">
<h3>Arquivo baixado: ${esc(name)}</h3>
<p>Escolha o contato na janela que abriu para enviar pelo WhatsApp.</p>
<p><a href="${esc(signedUrl)}" download="${esc(name)}" target="_blank">Baixar no computador</a> · <a href="#" onclick="history.back();return false">Voltar ao site</a></p>
<script>try{parent.postMessage(${payload.replace(/</g, "\\u003c")},"*")}catch(e){}</script></body>`;
  return new Response(page, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
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

  // Arquivo enviado pela página (download gerado por JavaScript): grava e
  // devolve a página que abre a janela de envio no painel.
  if (params.get("recebe-arquivo") === "1" && request.method === "POST") {
    try {
      const form = await request.formData();
      const arquivo = form.get("arquivo");
      if (!(arquivo instanceof File)) return new Response("Arquivo ausente.", { status: 400 });
      const nome =
        (typeof form.get("nome") === "string" && (form.get("nome") as string).trim()) ||
        arquivo.name ||
        "arquivo";
      const mime = arquivo.type || "application/octet-stream";
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      return await paginaArquivoBaixado(id, nome, mime, bytes);
    } catch {
      return new Response("Não foi possível receber o arquivo.", { status: 400 });
    }
  }

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
  unwrapNestedProxyParams(target, id);
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
  let corpo: BodyInit | null =
    request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
  // O modal de captcha da NFS-e também repete o destino do download no corpo
  // do POST. Desfazemos o proxy ali para a validação do portal aceitar a URL.
  if (corpo && reqContentType?.toLowerCase().includes("application/x-www-form-urlencoded")) {
    try {
      const form = new URLSearchParams(new TextDecoder().decode(corpo as ArrayBuffer));
      for (const [key, value] of form.entries()) {
        const clean = unwrapProxyValue(value, id, target.hostname);
        if (clean !== value) form.set(key, clean);
      }
      corpo = form.toString();
    } catch {
      /* mantém o corpo original */
    }
  }
  try {
    // Redirecionamentos são seguidos manualmente para não sair do site cadastrado
    // nem alcançar endereços internos.
    let atual = target;
    let resposta: Response | null = null;
    for (let salto = 0; salto < 1; salto += 1) {
      resposta = await fetch(atual.toString(), {
        method: request.method,
        redirect: "manual",
        headers: forwardHeaders,
        body: corpo,
        signal: AbortSignal.timeout(20_000),
      });
    }
    if (!resposta) throw new Error("sem resposta");
    upstream = resposta;
    target = atual;
  } catch {
    const host = target.hostname.replace(/[<>&"']/g, "");
    return new Response(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Site indisponível</title></head>` +
        `<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px">` +
        `<div><h2 style="margin:0 0 8px">Não foi possível abrir o site</h2>` +
        `<p style="margin:0;opacity:.75">O endereço <b>${host}</b> não respondeu. Ele pode estar fora do ar ou bloqueando o acesso.<br>Tente novamente em alguns minutos ou confira o endereço cadastrado.</p></div></body></html>`,
      { status: 200, headers: { "x-webview-error": "unreachable", "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
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

  // Redirecionamentos voltam para o navegador (passando pelo proxy), assim os
  // cookies de sessão definidos na resposta são gravados antes do próximo passo.
  const location = upstream.headers.get("location");
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    let destino = location;
    try {
      const abs = new URL(location, target);
      destino = abs.hostname === target.hostname ? proxyUrl(id, abs.toString()) : abs.toString();
    } catch {
      /* mantém */
    }
    headers.set("location", destino);
    return new Response(null, { status: upstream.status === 307 || upstream.status === 308 ? upstream.status : 303, headers });
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

  // Arquivos baixados (nota em PDF/XML): guarda na central e avisa o painel,
  // que abre a opção de enviar para um contato.
  const disposition = upstream.headers.get("content-disposition") ?? "";
  const isDownload =
    upstream.ok &&
    (/attachment/i.test(disposition) ||
      /application\/(pdf|xml|zip|octet-stream)|text\/xml/i.test(contentType));
  if (isDownload) {
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    let name =
      /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition)?.[1] ??
      /filename="?([^";]+)"?/i.exec(disposition)?.[1] ??
      "";
    try {
      name = decodeURIComponent(name.trim());
    } catch {
      /* mantém */
    }
    if (!name) {
      const ext = /pdf/i.test(contentType) ? "pdf" : /xml/i.test(contentType) ? "xml" : "bin";
      name = `nota-fiscal.${ext}`;
    }
    const mime = (contentType.split(";")[0] ?? contentType).trim();
    return await paginaArquivoBaixado(id, name, mime, bytes);
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

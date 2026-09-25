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

function mesmoPortal(hostname: string, allowedHostname: string) {
  const host = hostname.toLowerCase();
  const allowed = allowedHostname.toLowerCase();
  if (host === allowed) return true;
  const nfse = "nfse.gov.br";
  return (host === nfse || host.endsWith(`.${nfse}`)) &&
    (allowed === nfse || allowed.endsWith(`.${nfse}`));
}

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
    if (!mesmoPortal(target.hostname, allowedHost) || !/^https?:$/.test(target.protocol)) return value;
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
      if (!mesmoPortal(abs.hostname, target.hostname)) return `${match} data-wv-externo="1"`;
      return `${prefix}${quote}${proxyUrl(id, abs.toString())}${quote}`;
    },
  );

  // Alguns passos do emissor usam meta refresh em vez de um redirecionamento
  // HTTP. Sem reescrever esse destino, o iframe escapa do proxy e o navegador
  // mostra "conexão recusada".
  out = out.replace(
    /(<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix: string, content: string, suffix: string) => {
      const found = /^(\s*\d+\s*;\s*url\s*=\s*)(.+)$/i.exec(content);
      if (!found) return match;
      const destination = found[2];
      if (!destination) return match;
      const raw = destination.trim().replace(/^['"]|['"]$/g, "");
      try {
        const abs = new URL(raw, target);
        if (!mesmoPortal(abs.hostname, target.hostname)) return match;
        return `${prefix}${found[1]}${proxyUrl(id, abs.toString())}${suffix}`;
      } catch {
        return match;
      }
    },
  );

  // Faz chamadas feitas por JavaScript (fetch/XHR) e links externos
  // funcionarem dentro do proxy.
  const shim = `<script>(function(){var P=${JSON.stringify(PROXY_PATH)},I=${JSON.stringify(id)},B=${JSON.stringify(target.toString())},H=${JSON.stringify(target.hostname)},seen=new WeakSet(),ultimoSubmit=null,ultimoTexto="",ultimoClique=0;
 function avisa(t,m){try{parent.postMessage({type:t,message:m||""},location.origin);}catch(e){}}
 function portal(h){h=String(h||"").toLowerCase();var a=String(H).toLowerCase(),n="nfse.gov.br";return h===a||((h===n||h.slice(-(n.length+1))==="."+n)&&(a===n||a.slice(-(n.length+1))==="."+n));}
 function w(u){try{if(typeof u==="string"&&(u===P||u.indexOf(P+"?")===0))return u;var a=new URL(u,B);if(a.origin===location.origin&&a.pathname===P)return a.pathname+a.search+a.hash;if(!portal(a.hostname))return u;return P+"?id="+encodeURIComponent(I)+"&u="+encodeURIComponent(a.toString());}catch(e){return u;}}
 function interno(u){try{var a=new URL(u,B);return portal(a.hostname)||(a.origin===location.origin&&a.pathname===P&&a.searchParams.get("id")===I);}catch(e){return false;}}
 function nome(h,fallback){try{var p=new URL(h,B).pathname.split("/").pop();return decodeURIComponent(p||fallback||"nota-fiscal.pdf");}catch(e){return fallback||"nota-fiscal.pdf";}}
 function envia(b,n){if(!b||!b.size||seen.has(b))return Promise.resolve({ok:1});seen.add(b);var fd=new FormData();fd.append("arquivo",b,n||"nota-fiscal.pdf");fd.append("nome",n||"nota-fiscal.pdf");return f.call(window,P+"?id="+encodeURIComponent(I)+"&recebe-arquivo=1&formato=json",{method:"POST",body:fd,credentials:"same-origin"}).then(function(r){if(!r.ok)throw new Error("falha");return r.json();}).then(function(d){if(d&&d.type==="webview-download")parent.postMessage(d,location.origin);return d||{ok:1};});}
 function arquivo(r){var t=(r.headers.get("content-type")||"").toLowerCase(),d=(r.headers.get("content-disposition")||"").toLowerCase();return /pdf|xml|zip|octet-stream/.test(t)||/attachment/.test(d);}
  function cheira(b,n){var t=(b.type||"").toLowerCase();if(/pdf|xml|zip|octet-stream/.test(t)){envia(b,n);return;}if(t&&!/octet-stream/.test(t))return;Promise.resolve(b.slice(0,16).arrayBuffer()).then(function(x){var s=new TextDecoder("latin1").decode(x);if(/^%PDF-|^PK/.test(s)||/^\s*<\?xml/.test(s)||/^\s*<.+\?/i.test(s))envia(b,n);}).catch(function(){});}
  var co=URL.createObjectURL;if(co)URL.createObjectURL=function(b){var u=co.call(URL,b);try{if(b instanceof Blob&&b.size>0)cheira(b,b instanceof File&&b.name?b.name:"nota-fiscal.pdf");}catch(e){}return u;};
 if(navigator.msSaveBlob)navigator.msSaveBlob=function(b,n){envia(b,n||"nota-fiscal.pdf");return true;};if(navigator.msSaveOrOpenBlob)navigator.msSaveOrOpenBlob=function(b,n){envia(b,n||"nota-fiscal.pdf");return true;};
 var f=window.fetch;if(f)window.fetch=function(i,o){var raw=typeof i==="string"?i:(i&&i.url)||"",req=typeof i==="string"?w(i):i;return f.call(this,req,o).then(function(r){if(arquivo(r)){var c=r.clone();c.blob().then(function(b){return envia(b,nome(raw,"nota-fiscal.pdf"));}).catch(function(){});}return r;});};
  var x=XMLHttpRequest.prototype.open,s=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__wvNome=nome(String(u),"nota-fiscal.pdf");arguments[1]=w(String(u));return x.apply(this,arguments);};XMLHttpRequest.prototype.send=function(){this.addEventListener("load",function(){try{var t=(this.getResponseHeader("content-type")||"").toLowerCase(),d=(this.getResponseHeader("content-disposition")||"").toLowerCase();if(!/pdf|xml|zip|octet-stream/.test(t)&&!/attachment/.test(d))return;var b=this.response instanceof Blob?this.response:new Blob([this.response],{type:t||"application/pdf"});envia(b,this.__wvNome);}catch(e){}});return s.apply(this,arguments);};
  // Downloads gerados por script criam um <a> fora da página e clicam nele: sem
  // estar na página, nenhum ouvinte da página vê o clique e o navegador tenta
  // abrir o endereço original (que o painel não consegue mostrar). Aqui o
  // arquivo é capturado e o destino é reescrito para passar pelo proxy.
  var hc=HTMLElement.prototype.click;
  HTMLElement.prototype.click=function(){
   try{
    if(this.tagName==="A"){
     var h=this.getAttribute("href")||"";
     if(h.indexOf("blob:")===0||h.indexOf("data:")===0){
      if(this.hasAttribute("download")){
       var n=this.getAttribute("download")||nome(h,"arquivo");
       f.call(window,h).then(function(r){return r.blob();}).then(function(b){return envia(b,n);}).catch(function(){});
       return;
      }
     }else if(!/^(javascript:|mailto:|tel:|#)/i.test(h)){
      sa.call(this,"target","_self");
      sa.call(this,"href",w(h));
     }
    }
   }catch(e){}
   return hc.apply(this,arguments);
  };
  function abreDentro(u){try{location.href=w(u);}catch(e){try{location.assign(w(u));}catch(_){}}}
  function trataResposta(r,u){var t=(r.headers.get("content-type")||"").toLowerCase();if(t.indexOf("json")>=0)return r.json();if(arquivo(r))return r.blob().then(function(b){return envia(b,nome(u,"nota-fiscal.pdf"));});return r.text().then(function(x){var m=/parent\\.postMessage\\((\\{[\\s\\S]*?\\}),location\\.origin\\)/.exec(x);return m?JSON.parse(m[1]):null;});}
  function baixa(u){avisa("webview-download-start","Processando o PDF");var d=w(u),sep=d.indexOf("?")<0?"?":"&";d+=sep+"formato=json";f.call(window,d,{credentials:"same-origin",headers:{accept:"application/pdf,application/xml,application/zip,application/octet-stream,text/html,*/*"}}).then(function(r){return trataResposta(r,u);}).then(function(j){if(j&&j.type==="webview-download")parent.postMessage(j,location.origin);else if(!j||!j.ok)abreDentro(u);}).catch(function(){avisa("webview-download-error","Não foi possível capturar o PDF automaticamente.");abreDentro(u);});}
  function texto(el){if(!el)return"";var extra="";try{extra=((el.getAttribute("title")||"")+" "+(el.getAttribute("aria-label")||"")+" "+(el.getAttribute("href")||"")+" "+(el.getAttribute("onclick")||"")+" "+(el.getAttribute("formaction")||""));}catch(e){}return String(el.innerText||el.textContent||el.value||el.name||el.id||el.className||"")+" "+extra;}
  function botaoAtual(form,sub){if(sub)return sub;if(!ultimoSubmit||Date.now()-ultimoClique>7000)return null;try{if(ultimoSubmit.form===form||(ultimoSubmit.closest&&ultimoSubmit.closest("form")===form)||/danfse|download|baixar|pdf|xml|imprimir|visualizar|documento|nota/i.test(ultimoTexto))return ultimoSubmit;}catch(e){}return null;}
  function formBaixa(form,sub,a){sub=botaoAtual(form,sub);var alvo=((sub&&sub.getAttribute&&sub.getAttribute("formtarget"))||form.getAttribute("target")||"").toLowerCase(),tx=[a,form.id,form.name,form.className,texto(form),texto(sub),ultimoTexto].join(" ");return interno(a)&&(alvo&&alvo!=="_self"||/danfse|download|baixar|pdf|xml|imprimir|visualizar|documento|nota/i.test(tx));}
  function enviaForm(form,sub,a){avisa("webview-download-start","Processando o PDF");var metodo=((sub&&sub.getAttribute&&sub.getAttribute("formmethod"))||form.getAttribute("method")||"get").toUpperCase(),enc=((sub&&sub.getAttribute&&sub.getAttribute("formenctype"))||form.getAttribute("enctype")||form.enctype||"application/x-www-form-urlencoded").toLowerCase(),fd=new FormData(form);try{if(sub&&sub.name&&!fd.has(sub.name))fd.append(sub.name,sub.value||"");}catch(e){}var d=w(a),sep=d.indexOf("?")<0?"?":"&";d+=sep+"formato=json";var opt={credentials:"same-origin",headers:{accept:"application/pdf,application/xml,application/zip,application/octet-stream,text/html,*/*"}};if(metodo==="GET"){try{var u=new URL(d,location.origin);fd.forEach(function(v,k){if(typeof v==="string")u.searchParams.append(k,v);});d=u.pathname+u.search+u.hash;}catch(e){}}else{opt.method=metodo;if(enc.indexOf("multipart/form-data")>=0){opt.body=fd;}else{opt.body=new URLSearchParams(fd);}}f.call(window,d,opt).then(function(r){return trataResposta(r,a);}).then(function(j){if(j&&j.type==="webview-download")parent.postMessage(j,location.origin);else{try{sa.call(form,"target","_self");sa.call(form,"action",w(a));form.__wvDireto=1;fs.call(form);}catch(e){abreDentro(a);}}}).catch(function(){avisa("webview-download-error","Não foi possível capturar o PDF automaticamente.");try{sa.call(form,"target","_self");sa.call(form,"action",w(a));form.__wvDireto=1;fs.call(form);}catch(e){abreDentro(a);}});}
  document.addEventListener("click",function(e){var sub=e.target&&e.target.closest&&e.target.closest("button,input,a,[role=button]");if(!sub)return;var tx=texto(sub);if(/danfse|download|baixar|pdf|xml|imprimir|visualizar|documento|nota/i.test(tx)){ultimoSubmit=sub;ultimoTexto=tx;ultimoClique=Date.now();return;}if(sub.form){var tag=sub.tagName,t=(sub.getAttribute("type")||"").toLowerCase();if((tag==="BUTTON"&&(!t||t==="submit"||t==="button"))||(tag==="INPUT"&&(t==="submit"||t==="image"||t==="button"))){ultimoSubmit=sub;ultimoTexto=tx;ultimoClique=Date.now();}}},true);
 document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"",t=(a.getAttribute("target")||"").toLowerCase(),o=h;try{var q=new URL(h,location.href);if(q.pathname===P&&q.searchParams.get("u"))o=q.searchParams.get("u");}catch(_){}if(/^(blob:|data:|javascript:|mailto:|tel:|#)/i.test(h)||!interno(o))return;if(t==="_blank"||a.hasAttribute("download")||/download|\\.pdf|\\.xml|danfse/i.test(o)){e.preventDefault();e.stopImmediatePropagation();baixa(o);}},true);
 function janelaInterna(n){var href="about:blank",loc={assign:function(u){href=String(u||"");baixa(href);},replace:function(u){href=String(u||"");baixa(href);},reload:function(){},toString:function(){return href;}};try{Object.defineProperty(loc,"href",{get:function(){return href;},set:function(v){href=String(v||"");baixa(href);}});}catch(e){}var doc={open:function(){return doc;},close:function(){},write:function(x){try{var m=String(x||"").match(/https?:[^'\"<>\\s]+/i);if(m&&interno(m[0]))baixa(m[0]);}catch(e){}}};var win={name:n||"_blank",closed:false,document:doc,focus:function(){return true;},blur:function(){},close:function(){win.closed=true;},postMessage:function(){}};try{Object.defineProperty(win,"location",{get:function(){return loc;},set:function(v){href=String(v||"");baixa(href);}});}catch(e){win.location=loc;}return win;}
  var wo=window.open;window.open=function(u,n,o){if(u==null||u==="")return janelaInterna(n);if(typeof u!=="string")return wo.call(window,u,n,o);if(u.indexOf("blob:")===0||u.indexOf("data:")===0){avisa("webview-download-start","Processando o PDF");f.call(window,u).then(function(r){return r.blob();}).then(function(b){return envia(b,nome(u,"nota-fiscal.pdf"));}).catch(function(){avisa("webview-download-error","Não foi possível capturar o PDF automaticamente.");});return janelaInterna(n);}try{var a=new URL(u,B);if(portal(a.hostname)||(a.origin===location.origin&&a.pathname===P)){var j=janelaInterna(n);baixa(u);return j;}}catch(e){}return wo.call(window,u,n,o);};
 function protege(proto,prop){try{var d=Object.getOwnPropertyDescriptor(proto,prop);if(!d||!d.set||!d.get)return;Object.defineProperty(proto,prop,{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set:function(v){return d.set.call(this,typeof v==="string"?w(v):v);}});}catch(e){}}
  protege(HTMLAnchorElement.prototype,"href");protege(HTMLFormElement.prototype,"action");if(window.HTMLButtonElement)protege(HTMLButtonElement.prototype,"formAction");if(window.HTMLInputElement)protege(HTMLInputElement.prototype,"formAction");protege(HTMLIFrameElement.prototype,"src");if(window.HTMLFrameElement)protege(HTMLFrameElement.prototype,"src");protege(HTMLObjectElement.prototype,"data");protege(HTMLEmbedElement.prototype,"src");
 try{var la=Location.prototype.assign,lr=Location.prototype.replace;Location.prototype.assign=function(u){return la.call(this,typeof u==="string"?w(u):u);};Location.prototype.replace=function(u){return lr.call(this,typeof u==="string"?w(u):u);};var ld=Object.getOwnPropertyDescriptor(Location.prototype,"href");if(ld&&ld.get&&ld.set&&ld.configurable)Object.defineProperty(Location.prototype,"href",{configurable:true,enumerable:ld.enumerable,get:ld.get,set:function(v){return ld.set.call(this,typeof v==="string"?w(v):v);}});}catch(e){}
 function protegeAlvo(proto,fonte){try{var d=Object.getOwnPropertyDescriptor(proto,"target");if(!d||!d.set||!d.get)return;Object.defineProperty(proto,"target",{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set:function(v){var u=this.getAttribute(fonte)||"";return d.set.call(this,interno(u)?"_self":v);}});}catch(e){}}
 protegeAlvo(HTMLAnchorElement.prototype,"href");protegeAlvo(HTMLFormElement.prototype,"action");
  var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){var tag=this.tagName||"",url=(n==="href"&&tag==="A")||(n==="action"&&tag==="FORM")||(n==="formaction"&&(tag==="BUTTON"||tag==="INPUT"))||(n==="src"&&(tag==="IFRAME"||tag==="FRAME"||tag==="EMBED"))||(n==="data"&&tag==="OBJECT");if((n==="target"&&(tag==="A"||tag==="FORM"))||(n==="formtarget"&&(tag==="BUTTON"||tag==="INPUT")))v="_self";return sa.call(this,n,url&&typeof v==="string"?w(v):v);};
  function ajusta(root){var sel="a[href],form[action],button[formaction],input[formaction],iframe[src],frame[src],object[data],embed[src]",els=[];if(root&&root.matches&&root.matches(sel))els.push(root);if(root&&root.querySelectorAll)els=els.concat(Array.prototype.slice.call(root.querySelectorAll(sel)));els.forEach(function(el){var tag=el.tagName,at=tag==="FORM"?"action":tag==="BUTTON"||tag==="INPUT"?"formaction":tag==="OBJECT"?"data":tag==="A"?"href":"src",v=el.getAttribute(at);if(v&&!/^(blob:|data:|javascript:|mailto:|tel:|#)/i.test(v)){if((tag==="A"||tag==="FORM")&&el.getAttribute("target")!=="_self")sa.call(el,"target","_self");if((tag==="BUTTON"||tag==="INPUT")&&el.getAttribute("formtarget")!=="_self")sa.call(el,"formtarget","_self");var nv=w(v);if(nv!==v)sa.call(el,at,nv);}});}
  ajusta(document);new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==="attributes")ajusta(m.target);else Array.prototype.forEach.call(m.addedNodes,ajusta);});}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["href","action","formaction","src","data","target","formtarget"]});
  document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(!/^(blob:|data:|javascript:|mailto:|tel:|#)/i.test(h)){if(interno(h))sa.call(a,"target","_self");sa.call(a,"href",w(h));}},true);
   document.addEventListener("submit",function(e){var form=e.target;if(form&&form.tagName==="FORM"){if(form.__wvDireto){delete form.__wvDireto;return;}var sub=botaoAtual(form,e.submitter),override=sub&&sub.getAttribute&&sub.getAttribute("formaction"),a=override||form.getAttribute("action")||location.href||B;if(formBaixa(form,sub,a)){e.preventDefault();e.stopImmediatePropagation();enviaForm(form,sub,a);return;}sa.call(form,"target","_self");if(sub&&sub.setAttribute)sa.call(sub,"formtarget","_self");if(override)sa.call(sub,"formaction",w(override));else sa.call(form,"action",w(a));}},true);
   var fs=HTMLFormElement.prototype.submit,fr=HTMLFormElement.prototype.requestSubmit;HTMLFormElement.prototype.submit=function(){if(this.__wvDireto){delete this.__wvDireto;return fs.call(this);}var sub=botaoAtual(this,null),a=(sub&&sub.getAttribute&&sub.getAttribute("formaction"))||this.getAttribute("action")||location.href||B;if(formBaixa(this,sub,a)){enviaForm(this,sub,a);return;}if(a){try{var u=new URL(a,B);if(portal(u.hostname))sa.call(this,"target","_self");}catch(_){}sa.call(this,"action",w(a));}return fs.call(this);};if(fr)HTMLFormElement.prototype.requestSubmit=function(b){if(this.__wvDireto){delete this.__wvDireto;return b?fr.call(this,b):fr.call(this);}var sub=botaoAtual(this,b),a=(sub&&sub.getAttribute&&sub.getAttribute("formaction"))||this.getAttribute("action")||location.href||B;if(formBaixa(this,sub,a)){enviaForm(this,sub,a);return;}if(a){try{var u=new URL(a,B);if(portal(u.hostname))sa.call(this,"target","_self");}catch(_){}sa.call(this,"action",w(a));}return b?fr.call(this,b):fr.call(this);};
 var hp=history.pushState,hr=history.replaceState;history.pushState=function(s,t,u){return hp.call(this,s,t,typeof u==="string"?w(u):u);};history.replaceState=function(s,t,u){return hr.call(this,s,t,typeof u==="string"?w(u):u);};
 document.addEventListener("click",function(e){var el=e.target&&e.target.closest&&e.target.closest("a[data-wv-externo]");if(el){e.preventDefault();window.open(el.getAttribute("href"),"_blank","noopener");}},true);
 // Downloads gerados por JavaScript (blob/data) não passam pelo proxy: aqui o
 // arquivo é enviado para a central, que guarda e abre a janela de envio.
  document.addEventListener("click",function(e){
  var a=e.target&&e.target.closest&&e.target.closest("a[download]");
  if(!a)return;
  var h=a.getAttribute("href")||"";
  if(h.indexOf("blob:")!==0&&h.indexOf("data:")!==0)return;
  e.preventDefault();e.stopPropagation();
   var n=a.getAttribute("download")||nome(h,"arquivo");
   f.call(window,h).then(function(r){return r.blob();}).then(function(b){return envia(b,n);}).catch(function(){try{window.open(h,"_blank");}catch(_){}});
 },true);
 })();</script>`;
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => m + shim) : shim + out;
  return out;
}

/** Guarda o arquivo na central e devolve a página que abre a janela de envio. */
async function paginaArquivoBaixado(
  id: string,
  projectId: string | null,
  name: string,
  mime: string,
  bytes: Uint8Array,
  formato: "html" | "json" = "html",
) {
  const safe = name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `webview/${id}/${crypto.randomUUID()}-${safe}`;
  let signedUrl: string | null = null;
  let documentId: string | null = null;
  if (bytes.byteLength > 0 && bytes.byteLength <= 20 * 1024 * 1024) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("anexos").upload(path, bytes, { contentType: mime });
    if (!up.error) {
      const s = await supabaseAdmin.storage.from("anexos").createSignedUrl(path, 60 * 60 * 24 * 7);
      signedUrl = s.data?.signedUrl ?? null;
      const saved = await supabaseAdmin
        .from("webview_documents")
        .insert({
          webview_id: id,
          project_id: projectId,
          storage_path: path,
          file_name: name,
          mime_type: mime,
          size_bytes: bytes.byteLength,
        })
        .select("id")
        .single();
      documentId = saved.data?.id ?? null;
      if (saved.error) {
        await supabaseAdmin.storage.from("anexos").remove([path]);
        signedUrl = null;
      }
    }
  }
  if (!signedUrl) {
    if (formato === "json") {
      return Response.json({ error: "Não foi possível guardar o arquivo." }, { status: 502 });
    }
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px"><h3>Não foi possível guardar o arquivo</h3><p>Tente baixar novamente. Se continuar, use a opção de baixar no computador e anexe manualmente na conversa.</p><p><a href="#" onclick="history.back();return false">Voltar ao site</a></p></body>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  const download = { type: "webview-download", documentId, url: signedUrl, name, mimeType: mime };
  if (formato === "json") {
    return Response.json(download, { headers: { "cache-control": "no-store" } });
  }
  const payload = JSON.stringify(download);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const page = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">
<h3>Arquivo baixado: ${esc(name)}</h3>
<p>Escolha o contato na janela que abriu para enviar pelo WhatsApp.</p>
<p><a href="${esc(signedUrl)}" download="${esc(name)}" target="_blank">Baixar no computador</a> · <a href="#" onclick="history.back();return false">Voltar ao site</a></p>
<script>try{parent.postMessage(${payload.replace(/</g, "\\u003c")},location.origin);if(history.length>1)setTimeout(function(){history.back()},150)}catch(e){}</script></body>`;
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
    .select("url, project_id")
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
      return await paginaArquivoBaixado(
        id,
        data.project_id,
        nome,
        mime,
        bytes,
        params.get("formato") === "json" ? "json" : "html",
      );
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
      if (!mesmoPortal(candidate.hostname, target.hostname)) {
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
       destino = mesmoPortal(abs.hostname, target.hostname) ? proxyUrl(id, abs.toString()) : abs.toString();
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

  // Arquivos baixados (nota em PDF/XML): guarda na central e avisa o painel,
  // que abre a opção de enviar para um contato.
  const disposition = upstream.headers.get("content-disposition") ?? "";
  const contentLength = Number(upstream.headers.get("content-length") ?? "0");
  const targetLooksLikeFile = /\.(pdf|xml|zip)(?:$|[?#])/i.test(finalTarget.toString());
  const shouldInspectBody =
    upstream.ok &&
    contentLength <= 20 * 1024 * 1024 &&
    !/^(?:image|audio|video)\//i.test(contentType) &&
    !/(?:javascript|text\/css|font\/|woff)/i.test(contentType);
  let inspectedBytes: Uint8Array | null = null;
  let magicIsFile = false;
  if (shouldInspectBody) {
    inspectedBytes = new Uint8Array(await upstream.arrayBuffer());
    const signature = new TextDecoder("latin1").decode(inspectedBytes.slice(0, 16));
    magicIsFile =
      signature.startsWith("%PDF-") ||
      signature.startsWith("PK\u0003\u0004") ||
      /^\s*<\?xml/i.test(new TextDecoder().decode(inspectedBytes.slice(0, 128)));
  }
  const isDownload =
    upstream.ok &&
    (/attachment/i.test(disposition) ||
      /application\/(pdf|xml|zip|octet-stream)|text\/xml/i.test(contentType) ||
      targetLooksLikeFile ||
      magicIsFile);
  if (isDownload) {
    const bytes = inspectedBytes ?? new Uint8Array(await upstream.arrayBuffer());
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
    return await paginaArquivoBaixado(id, data.project_id, name, mime, bytes, params.get("formato") === "json" ? "json" : "html");
  }

  if (contentType.includes("text/html")) {
    const html = inspectedBytes
      ? new TextDecoder().decode(inspectedBytes)
      : await upstream.text();
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
        if (!mesmoPortal(abs.hostname, finalTarget.hostname)) return match;
        return `url(${quote}${proxyUrl(id, abs.toString())}${quote})`;
      } catch {
        return match;
      }
    });
    return new Response(rewritten, { status: upstream.status, headers });
  }

  const passthroughBody = inspectedBytes ? new Uint8Array(inspectedBytes).buffer : upstream.body;
  return new Response(passthroughBody, { status: upstream.status, headers });
}

export const Route = createFileRoute("/api/public/webview-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

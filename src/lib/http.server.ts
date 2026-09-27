// Regra da central: nenhuma chamada de saída pode ficar pendurada esperando um
// servidor lento. Todo `fetch` do servidor passa por aqui e recebe tempo limite
// obrigatório; quando repetir é seguro (leitura, download, consulta), também
// ganha novas tentativas com espera crescente e respeita o `retry-after`.
// Uso exclusivo no servidor.

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 500;
const MAX_RETRY_AFTER_MS = 10_000;

/** Status que valem uma nova tentativa: fila cheia, limite de uso ou falha momentânea. */
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type HttpOptions = {
  /** Nome do serviço, usado na mensagem de erro e no log (ex.: "DivulgaZap"). */
  label?: string;
  timeoutMs?: number;
  attempts?: number;
  /** Substitui a lista padrão de status que merecem nova tentativa. */
  retryStatus?: Iterable<number>;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTimeout(error: unknown) {
  const name = (error as Error | undefined)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Junta o prazo desta chamada com um cancelamento que o chamador já tenha passado. */
function sinalCombinado(timeoutMs: number, externo?: AbortSignal | null) {
  const prazo = AbortSignal.timeout(timeoutMs);
  if (!externo) return prazo;
  const combinar = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return typeof combinar === "function" ? combinar([prazo, externo]) : prazo;
}

/** Quanto esperar quando o próprio servidor informa o intervalo. */
function esperaPedidaPeloServidor(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const segundos = Number(header);
  if (Number.isFinite(segundos) && segundos >= 0) {
    return Math.min(segundos * 1000, MAX_RETRY_AFTER_MS);
  }
  const data = Date.parse(header);
  if (!Number.isNaN(data)) {
    return Math.min(Math.max(data - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return null;
}

function erroDeTempo(label: string, timeoutMs: number) {
  return new Error(
    `${label} não respondeu em ${Math.round(timeoutMs / 1000)}s. Tente novamente em instantes.`,
  );
}

function erroDeRede(label: string, error: unknown) {
  const detalhe = (error as Error)?.message;
  return new Error(
    `Não foi possível falar com ${label}. Confira a conexão e o endereço cadastrado.${
      detalhe ? ` (${detalhe})` : ""
    }`,
  );
}

/**
 * `fetch` com tempo limite e mensagem de erro clara. Uma tentativa só — use em
 * envios, cobranças e qualquer chamada que não possa ser repetida sem duplicar.
 */
export async function fetchComPrazo(
  url: string | URL,
  init: RequestInit = {},
  options: HttpOptions = {},
): Promise<Response> {
  const label = options.label ?? "o servidor";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    return await fetch(url, { ...init, signal: sinalCombinado(timeoutMs, init.signal) });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw isTimeout(error) ? erroDeTempo(label, timeoutMs) : erroDeRede(label, error);
  }
}

/**
 * `fetch` com tempo limite e novas tentativas. Só para chamadas idempotentes
 * (GET, download, consulta de status): repetir um envio criaria duplicidade.
 */
export async function fetchResiliente(
  url: string | URL,
  init: RequestInit = {},
  options: HttpOptions = {},
): Promise<Response> {
  const label = options.label ?? "o servidor";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const retryStatus = options.retryStatus ? new Set(options.retryStatus) : RETRY_STATUS;
  let ultimoErro: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: sinalCombinado(timeoutMs, init.signal),
      });
      if (retryStatus.has(response.status) && attempt < attempts) {
        const espera = esperaPedidaPeloServidor(response) ?? DEFAULT_DELAY_MS * attempt;
        console.warn(
          `[http] ${label}: respondeu ${response.status} na tentativa ${attempt}/${attempts}; repetindo em ${espera}ms`,
        );
        await wait(espera);
        continue;
      }
      return response;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      ultimoErro = isTimeout(error) ? erroDeTempo(label, timeoutMs) : erroDeRede(label, error);
      console.error(
        `[http] ${label}: tentativa ${attempt}/${attempts} falhou —`,
        (ultimoErro as Error).message,
      );
      if (attempt < attempts) await wait(DEFAULT_DELAY_MS * attempt);
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : erroDeRede(label, ultimoErro);
}

/** Igual a `fetchResiliente`, mas devolve `null` em vez de lançar (usos opcionais). */
export async function fetchOpcional(
  url: string | URL,
  init: RequestInit = {},
  options: HttpOptions = {},
): Promise<Response | null> {
  try {
    return await fetchResiliente(url, init, options);
  } catch {
    return null;
  }
}

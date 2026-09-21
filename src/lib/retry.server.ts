// Regra da central: nenhuma mensagem recebida ou enviada pode se perder por
// uma falha passageira (queda de rede, timeout do banco, instabilidade da API).
// Toda gravação crítica passa por aqui e é tentada novamente algumas vezes.

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Repete a operação com espera crescente; devolve o resultado ou lança o último erro. */
export async function withRetry<T>(
  label: string,
  operation: () => Promise<T>,
  options?: { attempts?: number; delayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.error(
        `[retry] ${label}: tentativa ${attempt}/${attempts} falhou —`,
        (error as Error)?.message ?? error,
      );
      if (attempt < attempts) await wait(delayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

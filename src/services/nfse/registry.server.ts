// Escolhe o provedor de NFS-e conforme o padrão configurado.
// Basta registrar um novo provedor aqui para migrar ABRASF → Padrão Nacional.
import type { NfseProvider } from "@/services/nfse/types";
import { goianiaProvider } from "./providers/goiania/index.server";

export function getNfseProvider(padrao: string): NfseProvider {
  switch (padrao) {
    case "abrasf204":
    default:
      return goianiaProvider;
  }
}

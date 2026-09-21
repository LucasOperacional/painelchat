export type BrandingTheme = {
  id: string;
  name: string;
  description: string;
  primary: string;
  accent: string;
};

export const BRANDING_THEMES: BrandingTheme[] = [
  {
    id: "nxs-red",
    name: "NXS Vermelho",
    description: "Central operacional premium",
    primary: "#FF493D",
    accent: "#4D8DFF",
  },
  {
    id: "executive-blue",
    name: "Azul Executivo",
    description: "Confiança e clareza",
    primary: "#2563eb",
    accent: "#06b6d4",
  },
  {
    id: "service-green",
    name: "Verde Atendimento",
    description: "Próximo e acolhedor",
    primary: "#16a34a",
    accent: "#22c55e",
  },
  {
    id: "emerald",
    name: "Esmeralda",
    description: "Elegante e equilibrado",
    primary: "#059669",
    accent: "#14b8a6",
  },
  {
    id: "coral",
    name: "Coral",
    description: "Calor e energia",
    primary: "#e64b3c",
    accent: "#f59e0b",
  },
  {
    id: "violet",
    name: "Violeta",
    description: "Criativo e marcante",
    primary: "#7c3aed",
    accent: "#a855f7",
  },
  {
    id: "rose",
    name: "Rosa",
    description: "Expressivo e moderno",
    primary: "#db2777",
    accent: "#f43f5e",
  },
  {
    id: "amber",
    name: "Âmbar",
    description: "Luminoso e dinâmico",
    primary: "#d97706",
    accent: "#eab308",
  },
  {
    id: "graphite-neon",
    name: "Grafite Neon",
    description: "Tecnologia e contraste",
    primary: "#65a30d",
    accent: "#06b6d4",
  },
];

function contrastingForeground(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return "#ffffff";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#172033" : "#ffffff";
}

export function applyBrandingColors(primary: string, accent: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const foreground = contrastingForeground(primary);
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", foreground);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-primary-foreground", foreground);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--sidebar-ring", accent);
  root.style.setProperty("--chart-1", primary);
  root.style.setProperty("--chart-2", accent);
  root.style.setProperty("--message-sent", primary);
  root.style.setProperty("--message-sent-foreground", foreground);
}

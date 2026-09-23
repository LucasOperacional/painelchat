import type { ReactNode, KeyboardEvent } from "react";
import { AlertTriangle, Clock, Pencil, Phone, Star, Trash2, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DeviceCardProps = {
  label: string;
  company?: string;
  displayId?: string;
  color?: string;
  providerLabel: string;
  status: string;
  phone?: string;
  updatedAt?: string;
  isDefault?: boolean;
  isSelected?: boolean;
  isConnected?: boolean;
  onSelect?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onDisconnect?: (() => void) | undefined;
  onMakeDefault?: (() => void) | undefined;
  children?: ReactNode;
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectado",
  connecting: "Aguardando pareamento",
  disconnected: "Desconectado",
};

function formatDateTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DeviceCard({
  label,
  company = "Suporte",
  displayId,
  color = "#0ea5e9",
  providerLabel,
  status,
  phone,
  updatedAt,
  isDefault,
  isSelected,
  isConnected,
  onSelect,
  onEdit,
  onDelete,
  onDisconnect,
  children,
}: DeviceCardProps) {
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  const statusLabel = STATUS_LABEL[status] ?? "Desconectado";
  const connected = isConnected ?? status === "connected";
  const clickable = !!onSelect && !isSelected;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.();
    }
  };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? isSelected : undefined}
      aria-label={clickable ? `Selecionar dispositivo ${label}` : undefined}
      onClick={clickable ? onSelect : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all outline-none",
        isSelected
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5",
        clickable && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {clickable && (
        <div className="absolute right-3 top-3 text-muted-foreground/60">
          <ChevronsUpDown className="size-4" aria-hidden="true" />
        </div>
      )}

      <div className="flex items-start gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold"
          style={{ backgroundColor: `${color}26`, color }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-card-foreground">
              {label}
            </h3>
            {isDefault && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Padrão
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Empresa: {company}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>ID: {displayId ?? "—"}</span>
            <Badge className="bg-purple/15 text-purple-foreground hover:bg-purple/20 border-0 text-[10px] px-1.5 py-0">
              {providerLabel}
            </Badge>
          </div>
          {!isSelected && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  connected ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              <span className={cn("font-medium", connected ? "text-success" : "text-muted-foreground")}>
                {statusLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {isSelected && (
        <>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  connected ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              <span className={cn("font-medium", connected ? "text-success" : "text-muted-foreground")}>
                {statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="size-3.5" />
              <span>{phone?.trim() || "Não informado"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-3.5" />
              <span>{formatDateTime(updatedAt)}</span>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            {connected && onDisconnect && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDisconnect();
                }}
                className="w-full border-destructive/50 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <AlertTriangle className="mr-1.5 size-4" />
                Desconectar
              </Button>
            )}

            <div className="grid grid-cols-2 gap-2">
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="w-full border-success/50 text-success hover:bg-success/10 hover:text-success"
                >
                  <Pencil className="mr-1.5 size-3.5" />
                  Editar
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  Excluir
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {children && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-1 space-y-4 border-t border-border pt-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}

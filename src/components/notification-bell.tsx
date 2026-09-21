import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMessageNotifications } from "@/hooks/use-message-notifications";

export function NotificationBell() {
  const { unread, muted, toggleMuted, clearUnread } = useMessageNotifications();
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          unread > 0 ? `${unread} mensagens novas` : "Nenhuma mensagem nova"
        }
        onClick={() => {
          clearUnread();
          void navigate({ to: "/atendimento" });
        }}
        className="relative"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={muted ? "Ativar som das notificações" : "Silenciar notificações"}
        onClick={toggleMuted}
      >
        {muted ? (
          <BellOff className="size-4 text-muted-foreground" />
        ) : (
          <Bell className="size-4 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

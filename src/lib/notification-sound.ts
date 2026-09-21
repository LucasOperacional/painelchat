// Som de notificação de mensagem nova. O navegador só libera áudio depois de
// alguma interação do usuário, então destravamos o contexto no primeiro clique.
let ctx: AudioContext | null = null;
let unlockBound = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) {
    try {
      ctx = new Ctx();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Libera o áudio na primeira interação do usuário (clique, toque ou tecla). */
export function bindAudioUnlock() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") void c.resume();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
}

/** Toca um aviso curto de duas notas. */
export function playNotificationSound() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  try {
    const start = c.currentTime;
    [
      { freq: 784, at: 0 },
      { freq: 1046, at: 0.13 },
    ].forEach(({ freq, at }) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  } catch {
    // som é opcional
  }
}

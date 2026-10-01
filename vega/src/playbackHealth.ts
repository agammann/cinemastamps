export function createPlaybackHealth(timeoutMs = 8000) {
  let lastPosition = 0;
  let lastProgressAt: number | null = null;
  let reported = false;
  return (position: number, active: boolean, now: number) => {
    if (!active || Math.abs(position - lastPosition) > 0.02) {
      lastProgressAt = now;
      reported = false;
    }
    lastPosition = position;
    if (lastProgressAt === null) lastProgressAt = now;
    if (active && !reported && now - lastProgressAt >= timeoutMs) {
      reported = true;
      return true;
    }
    return false;
  };
}

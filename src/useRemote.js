import { useEffect } from "react";
export function focusable(root = document) {
  return [
    ...root.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea, select, a[href], [tabindex="0"]',
    ),
  ].filter(
    (el) =>
      el.getClientRects().length &&
      getComputedStyle(el).visibility !== "hidden",
  );
}
export default function useRemote(onShortcut) {
  useEffect(() => {
    const handle = (event) => {
      const active = document.activeElement;
      const editing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName) &&
        active?.type !== "range";
      if (event.key === "Escape" || event.key === "BrowserBack") {
        onShortcut("back");
        event.preventDefault();
        return;
      }
      if (editing) return;
      if (
        active?.type === "range" &&
        ["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      if (
        [
          "1",
          "2",
          "3",
          " ",
          "MediaPlayPause",
          "MediaRewind",
          "MediaFastForward",
        ].includes(event.key)
      ) {
        event.preventDefault();
        if (!document.querySelector('[role="dialog"]')) onShortcut(event.key);
        return;
      }
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      const root =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('.player-area.theater') ||
        document;
      const options = focusable(root);
      if (!options.includes(active)) {
        options[0]?.focus();
        return;
      }
      const a = active.getBoundingClientRect();
      const ax = a.x + a.width / 2,
        ay = a.y + a.height / 2;
      const horizontal =
        event.key === "ArrowLeft" || event.key === "ArrowRight";
      const positive = event.key === "ArrowRight" || event.key === "ArrowDown";
      let best,
        distance = Infinity;
      for (const el of options) {
        if (el === active) continue;
        const b = el.getBoundingClientRect(),
          dx = b.x + b.width / 2 - ax,
          dy = b.y + b.height / 2 - ay;
        const primary = horizontal ? dx : dy,
          secondary = horizontal ? dy : dx;
        if ((positive ? primary : -primary) <= 3) continue;
        const score = Math.abs(primary) + Math.abs(secondary) * 3;
        if (score < distance) {
          distance = score;
          best = el;
        }
      }
      best?.focus();
      best?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onShortcut]);
}

import type { Schedule, TokenUsage } from "@repo/contract";

const two = (n: number) => String(n).padStart(2, "0");

/** 24-hour local time, "21:04". */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** "21:04:11" for the action list. */
export function clockSeconds(iso: string): string {
  const d = new Date(iso);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "8 Oct, 21:04" */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(iso)}`;
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Relative under an hour ("3 min ago"), otherwise the time, with the date when it is not today. */
export function when(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const ago = now - t;
  if (ago >= 0 && ago < 45_000) return "just now";
  if (ago >= 0 && ago < 3_600_000)
    return `${Math.max(1, Math.round(ago / 60_000))} min ago`;
  const sameDay = new Date(now).toDateString() === new Date(t).toDateString();
  return sameDay ? clock(iso) : dateTime(iso);
}

/** "14 s", "2 min 36 s" */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** "0:42" — minutes and seconds until a time. */
export function countdown(iso: string, now: number): string {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

/** "next in 0:42" under an hour away, otherwise the time. `frozen` shows "?". */
export function nextRun(
  iso: string | null,
  now: number,
  frozen = false,
): string {
  if (!iso) return "no next run";
  const away = new Date(iso).getTime() - now;
  if (away < 3_600_000)
    return frozen ? "next in ?" : `next in ${countdown(iso, now)}`;
  return `next at ${when(iso, now)}`;
}

export function scheduleWords(schedule: Schedule): string {
  if (schedule.kind === "daily") return `Every night at ${schedule.time}`;
  return schedule.minutes === 1
    ? "Every 1 minute"
    : `Every ${schedule.minutes} minutes`;
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

export function tokenTooltip(t: TokenUsage): string {
  return `${count(t.input)} input · ${count(t.output)} output · ${count(t.cached)} cached`;
}

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function roman(n: number): string {
  let out = "";
  let rest = n;
  for (const [value, mark] of ROMAN) {
    while (rest >= value) {
      out += mark;
      rest -= value;
    }
  }
  return out;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

const NUMBER_WORDS =
  "No One Two Three Four Five Six Seven Eight Nine Ten".split(" ");
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** The most recent local noon: one whole night is one period. */
export function lastNoon(now: number): number {
  const d = new Date(now);
  const noon = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    12,
  ).getTime();
  return noon <= now ? noon : noon - 86_400_000;
}

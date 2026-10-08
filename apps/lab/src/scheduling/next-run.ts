import { SCHEDULE_MINUTES_MAX, SCHEDULE_MINUTES_MIN, type Schedule } from "@repo/contract";

const DAILY_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The next time a schedule is due, strictly after `after`. Null when the
 * schedule is not valid. Daily times are in the machine's local time zone.
 */
export function nextRun(schedule: Schedule, after: Date): Date | null {
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) return null;

  if (schedule?.kind === "every") {
    const { minutes } = schedule;
    if (!Number.isInteger(minutes)) return null;
    if (minutes < SCHEDULE_MINUTES_MIN || minutes > SCHEDULE_MINUTES_MAX) return null;
    return new Date(after.getTime() + minutes * 60_000);
  }

  if (schedule?.kind === "daily") {
    const match = typeof schedule.time === "string" ? DAILY_TIME.exec(schedule.time) : null;
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    // Built from local date parts, so a day with a clock change is still one day.
    const at = (dayOffset: number) =>
      new Date(after.getFullYear(), after.getMonth(), after.getDate() + dayOffset, hours, minutes, 0, 0);
    const today = at(0);
    return today.getTime() > after.getTime() ? today : at(1);
  }

  return null;
}

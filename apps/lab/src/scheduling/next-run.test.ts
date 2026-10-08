import assert from "node:assert/strict";
import { test } from "node:test";
import type { Schedule } from "@repo/contract";

// Local time is the machine's; the tests pin it so the clock changes are known.
// Europe/Prague: clocks go forward on 2026-03-29 and back on 2026-10-25.
process.env.TZ = "Europe/Prague";

const { nextRun, scheduling } = await import("./index.ts");

const local = (year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0) =>
  new Date(year, month - 1, day, hours, minutes, seconds);

const daily = (time: string): Schedule => ({ kind: "daily", time });
const every = (minutes: number): Schedule => ({ kind: "every", minutes });

test("daily: later the same day when the time has not passed", () => {
  assert.deepEqual(nextRun(daily("08:00"), local(2026, 10, 9, 7, 59, 59)), local(2026, 10, 9, 8, 0));
});

test("daily: the next day when the time has passed", () => {
  assert.deepEqual(nextRun(daily("08:00"), local(2026, 10, 9, 8, 0, 1)), local(2026, 10, 10, 8, 0));
});

test("daily: strictly after, so exactly on the time gives the next day", () => {
  assert.deepEqual(nextRun(daily("08:00"), local(2026, 10, 9, 8, 0)), local(2026, 10, 10, 8, 0));
});

test("daily: rolls over the end of a month and a year", () => {
  assert.deepEqual(nextRun(daily("00:00"), local(2026, 12, 31, 23, 30)), local(2027, 1, 1, 0, 0));
  assert.deepEqual(nextRun(daily("23:59"), local(2026, 2, 28, 23, 59)), local(2026, 3, 1, 23, 59));
});

test("daily: the day the clocks go forward is 23 hours long", () => {
  const after = local(2026, 3, 28, 8, 0);
  const next = nextRun(daily("08:00"), after);
  assert.equal(next?.toISOString(), "2026-03-29T06:00:00.000Z");
  assert.equal((next!.getTime() - after.getTime()) / 3_600_000, 23);
});

test("daily: the day the clocks go back is 25 hours long", () => {
  const after = local(2026, 10, 24, 8, 0);
  const next = nextRun(daily("08:00"), after);
  assert.equal(next?.toISOString(), "2026-10-25T07:00:00.000Z");
  assert.equal((next!.getTime() - after.getTime()) / 3_600_000, 25);
});

test("daily: a time the clock skips still runs once that day", () => {
  const next = nextRun(daily("02:30"), local(2026, 3, 28, 12, 0));
  assert.equal(next?.toISOString(), "2026-03-29T01:30:00.000Z");
  assert.deepEqual(nextRun(daily("02:30"), next!), local(2026, 3, 30, 2, 30));
});

test("daily: a time the clock repeats runs once that day", () => {
  const first = nextRun(daily("02:30"), local(2026, 10, 24, 12, 0));
  assert.equal(first?.toISOString(), "2026-10-25T00:30:00.000Z");
  const duringTheRepeat = new Date("2026-10-25T01:10:00.000Z");
  assert.deepEqual(nextRun(daily("02:30"), duringTheRepeat), local(2026, 10, 26, 2, 30));
});

test("every: N minutes after the given time", () => {
  const after = local(2026, 10, 9, 23, 59, 30);
  assert.deepEqual(nextRun(every(2), after), local(2026, 10, 10, 0, 1, 30));
  assert.equal(nextRun(every(1), after)?.getTime(), after.getTime() + 60_000);
  assert.equal(nextRun(every(1440), after)?.getTime(), after.getTime() + 86_400_000);
});

test("a time that is not HH:MM gives null", () => {
  for (const time of ["", "8:00", "24:00", "08:60", "08:00:00", " 08:00", "0800", "ab:cd"]) {
    assert.equal(nextRun(daily(time), local(2026, 10, 9)), null, time);
  }
});

test("minutes outside 1 to 1440 give null", () => {
  for (const minutes of [0, -5, 1441, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(nextRun(every(minutes), local(2026, 10, 9)), null, String(minutes));
  }
});

test("an unknown schedule or an invalid date gives null", () => {
  assert.equal(nextRun({ kind: "weekly" } as unknown as Schedule, local(2026, 10, 9)), null);
  assert.equal(nextRun(null as unknown as Schedule, local(2026, 10, 9)), null);
  assert.equal(nextRun(daily("08:00"), new Date(Number.NaN)), null);
});

test("the seam answers with the same value", async () => {
  const after = local(2026, 10, 9, 9, 0);
  const signal = new AbortController().signal;
  assert.deepEqual(await scheduling.nextRunAt(daily("08:00"), after, signal), local(2026, 10, 10, 8, 0));
  assert.equal(await scheduling.nextRunAt(daily("nope"), after, signal), null);
});

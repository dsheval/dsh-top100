/** Long-running Beijing-time scheduler for the Docker deployment. */

import "./env.js";

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const timeZone = process.env.TZ ?? "Asia/Shanghai";
const collectHour = Number(process.env.COLLECT_HOUR ?? "6");
const fullDiscoveryWeekday = Number(process.env.FULL_DISCOVERY_WEEKDAY ?? "0");
if (!Number.isInteger(collectHour) || collectHour < 0 || collectHour > 23) {
  throw new Error("COLLECT_HOUR must be an integer from 0 to 23");
}
if (!Number.isInteger(fullDiscoveryWeekday) || fullDiscoveryWeekday < 0 || fullDiscoveryWeekday > 6) {
  throw new Error("FULL_DISCOVERY_WEEKDAY must be an integer from 0 (Sunday) to 6 (Saturday)");
}

let running = false;
let lastCollectionDate = "";

function partsInTimeZone(
  date: Date
): { date: string; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday,
  };
}

async function runScript(
  script: "db:sync" | "update:once",
  environment: Record<string, string> = {}
): Promise<void> {
  if (running) return;
  running = true;
  console.log(`[scheduler] starting npm run ${script}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("npm", ["run", script], {
        cwd: projectRoot,
        env: { ...process.env, ...environment },
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`npm run ${script} exited with ${code ?? signal}`));
      });
    });
    console.log(`[scheduler] npm run ${script} completed`);
  } catch (error) {
    console.error(`[scheduler] ${(error as Error).message}`);
  } finally {
    running = false;
  }
}

async function tick(): Promise<void> {
  const current = partsInTimeZone(new Date());
  if (
    current.hour === collectHour &&
    current.minute < 5 &&
    current.date !== lastCollectionDate
  ) {
    lastCollectionDate = current.date;
    const discoveryMode = current.weekday === fullDiscoveryWeekday ? "full" : "incremental";
    console.log(`[scheduler] ${current.date} discovery mode=${discoveryMode}`);
    await runScript("update:once", { DSH_DISCOVERY_MODE: discoveryMode });
  }
}

console.log(
  `[scheduler] timezone=${timeZone}, daily hour=${collectHour}:00, full discovery weekday=${fullDiscoveryWeekday}`
);
if (process.env.RUN_COLLECT_ON_STARTUP === "true") {
  const current = partsInTimeZone(new Date());
  const discoveryMode = current.weekday === fullDiscoveryWeekday ? "full" : "incremental";
  await runScript("update:once", { DSH_DISCOVERY_MODE: discoveryMode });
} else {
  await runScript("db:sync");
}
await tick();
setInterval(() => void tick(), 60_000);

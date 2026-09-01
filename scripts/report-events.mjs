import { pathToFileURL } from "node:url";

export const HIGH_INTENT_EVENTS = Object.freeze([
  "search_used",
  "plugin_github_click",
  "plugin_link_copy",
  "install_guide_open",
  "install_command_copy",
]);

const EVENT_NAMES = new Set([
  "page_view",
  "search_used",
  "ranking_view_changed",
  "category_selected",
  "plugin_github_click",
  "plugin_link_copy",
  "install_guide_open",
  "install_command_copy",
]);
const HIGH_INTENT_SET = new Set(HIGH_INTENT_EVENTS);
const SESSION_PATTERN = /^s_[A-Za-z0-9_-]{12,64}$/;

function parseEventLine(line) {
  const start = line.indexOf("{");
  if (start < 0) return null;
  try {
    const event = JSON.parse(line.slice(start));
    if (!EVENT_NAMES.has(event?.event) || !SESSION_PATTERN.test(event?.session ?? "")) {
      return null;
    }
    return event;
  } catch {
    return null;
  }
}

export function summarizeEventLines(input) {
  const sessions = new Set();
  const highIntentSessions = new Set();
  const events = Object.fromEntries([...EVENT_NAMES].map((event) => [event, 0]));

  for (const line of String(input ?? "").split(/\r?\n/)) {
    const event = parseEventLine(line);
    if (!event) continue;
    events[event.event] += 1;
    sessions.add(event.session);
    if (HIGH_INTENT_SET.has(event.event)) highIntentSessions.add(event.session);
  }

  return {
    validEvents: Object.values(events).reduce((sum, count) => sum + count, 0),
    validSessions: sessions.size,
    highIntentSessions: highIntentSessions.size,
    events,
  };
}

async function main() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(`${JSON.stringify(summarizeEventLines(input), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

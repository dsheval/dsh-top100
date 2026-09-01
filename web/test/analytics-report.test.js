import assert from "node:assert/strict";
import test from "node:test";

import { HIGH_INTENT_EVENTS, summarizeEventLines } from "../../scripts/report-events.mjs";

test("computes the weekly high-intent session metric without exposing session ids", () => {
  const report = summarizeEventLines([
    '{"event":"page_view","session":"s_abcdefghijkl","view":"home"}',
    '{"event":"search_used","session":"s_abcdefghijkl","view":"search"}',
    '{"event":"install_guide_open","session":"s_mnopqrstuvwx","view":"dsh"}',
    '{"event":"ranking_view_changed","session":"s_mnopqrstuvwx","view":"rising"}',
    '{"event":"unknown","session":"s_ignoredsession"}',
    'not json',
  ].join("\n"));

  assert.equal(report.validEvents, 4);
  assert.equal(report.validSessions, 2);
  assert.equal(report.highIntentSessions, 2);
  assert.equal(report.events.search_used, 1);
  assert.equal(JSON.stringify(report).includes("s_abcdefghijkl"), false);
  assert.deepEqual(HIGH_INTENT_EVENTS, [
    "search_used",
    "plugin_github_click",
    "plugin_link_copy",
    "install_guide_open",
    "install_command_copy",
  ]);
});

test("ignores invalid sessions and prefixed non-event log lines", () => {
  const report = summarizeEventLines([
    'web-1 | {"event":"install_command_copy","session":"too-short"}',
    'web-1 | {"event":"plugin_github_click","session":"s_123456789012"}',
    '127.0.0.1 - - [date] "GET / HTTP/1.1" 200 10',
  ].join("\n"));

  assert.equal(report.validEvents, 1);
  assert.equal(report.validSessions, 1);
  assert.equal(report.highIntentSessions, 1);
});

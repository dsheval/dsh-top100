import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(new URL("../../docker/nginx.conf", import.meta.url), "utf8");
const robots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");

function locationBlock(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = config.match(new RegExp(`location = ${escaped} \\{([\\s\\S]*?)\\n  \\}`));
  assert.ok(match, `missing exact Nginx location for ${path}`);
  return match[1];
}

test("serves SEO assets as exact files with explicit content types", () => {
  const expected = new Map([
    ["/robots.txt", "text/plain"],
    ["/sitemap.xml", "application/xml"],
    ["/favicon.svg", "image/svg+xml"],
    ["/favicon.ico", "image/x-icon"],
    ["/assets/dsh-top100-og.png", "image/png"],
  ]);

  for (const [path, contentType] of expected) {
    const block = locationBlock(path);
    assert.match(block, /try_files \$uri =404;/);
    assert.match(block, new RegExp(`default_type ${contentType.replace("+", "\\+")};`));
  }
});

test("keeps manifest mutable and snapshot data immutable", () => {
  assert.match(config, /\/data\/manifest\.json "public, max-age=300, must-revalidate";/);
  assert.match(config, /"~\^\/data\/snapshots\/" "public, max-age=31536000, immutable";/);
  assert.match(config, /location \^~ \/data\/snapshots\/ \{[\s\S]*?try_files \$uri =404;/);
});

test("allows homepage render data while preventing JSON indexing", () => {
  assert.match(robots, /Allow: \/data\/manifest\.json/);
  assert.match(robots, /Allow: \/data\/snapshots\//);
  assert.match(robots, /Allow: \/data\/rankings-hot\.json/);
  assert.match(robots, /Disallow: \/data\//);
  assert.match(config, /"~\^\/data\/" "noindex, nofollow";/);
  assert.match(config, /add_header X-Robots-Tag "\$response_x_robots_tag" always;/);
});

test("event logging uses only allow-listed dimensions", () => {
  const format = config.match(/log_format event_json escape=json([\s\S]*?);\n\nserver/);
  assert.ok(format, "missing event_json log format");
  assert.match(format[1], /\$event_name/);
  assert.match(format[1], /\$event_session/);
  assert.doesNotMatch(
    format[1],
    /\$remote_addr|\$http_user_agent|\$http_referer|\$request_uri|\$request_body/,
  );

  const eventLocation = locationBlock("/api/events");
  assert.match(eventLocation, /return 204;/);
  assert.match(eventLocation, /event_json if=\$event_should_log/);
  assert.match(config, /map \$request_method \$event_method_is_valid \{\s+default 0;\s+POST 1;/);
  assert.doesNotMatch(config, /map \$request_method \$event_method_is_valid \{[\s\S]*?GET 1;/);
  assert.match(config, /\^1:1:s_\[A-Za-z0-9_-\]\{12,64\}\$/);
});

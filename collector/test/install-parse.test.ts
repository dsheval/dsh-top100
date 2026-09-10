import { describe, expect, it } from "vitest";
import { parseInstallCommands } from "../src/install-parse.js";
import { resolveSearchInstallTarget } from "../src/search-index.js";
import type { RankingsDocument } from "../src/rankings.js";

const fence = (text: string) => `## 安装\n\`\`\`sh\n${text}\n\`\`\``;
describe("README installation extraction", () => {
  it.each([
    "dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.16-rc.1",
    "dsh plugin --profile web add -w @xmanrui/dsh-im",
    "dsh plugin add npm:@kenz1117/dsh-ui-usage-billing@latest",
    "corepack pnpm dsh plugin --profile web add dsh-synapse",
    "corepack pnpm exec dsh plugin --profile tui add dsh-synapse",
    "dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/",
    "corepack pnpm exec dsh plugin add demo --registry=https://mirror.example/",
  ])("retains safe author syntax and its conditions for display: %s", (command) => {
    expect(parseInstallCommands(fence(command)).commands).toEqual([command]);
  });
  it("retains a wrapped custom-Profile command outside the first section without turning it into a Web target", () => {
    const command = "corepack pnpm dsh plugin --profile research add @acme/demo";
    const readme = fence("npm install") + `\n## DSH\n\`\`\`sh\n${command}\n\`\`\``;
    const commands = parseInstallCommands(readme).commands;
    expect(commands).toContain(command);
    expect(resolveSearchInstallTarget({ fullName: "acme/demo", type: "cordis-plugin", install: { commands, packageName: "@acme/demo" } } as RankingsDocument["rankings"]["total"][number])).toBeNull();
  });
  it("collects our own documented npx installation command", () => {
    const command = "npx @deepseek-ai/dsh plugin --profile web add @dsheval/dsh-top100-plugin";
    expect(parseInstallCommands(fence(command)).commands).toEqual([command]);
  });
  it("preserves Git refs while removing only real comments", () => {
    expect(parseInstallCommands(fence("dsh plugin add github:acme/demo#v1 # install" )).commands)
      .toEqual(["dsh plugin add github:acme/demo#v1"]);
  });
  it("finds inline commands and joins shell line continuations", () => {
    expect(parseInstallCommands('安装：`npx @deepseek-ai/dsh plugin add @acme/demo`').commands).toHaveLength(1);
    expect(parseInstallCommands(fence("npx @deepseek-ai/dsh \\\n  plugin --profile web add @acme/demo")).commands)
      .toEqual(["npx @deepseek-ai/dsh plugin --profile web add @acme/demo"]);
  });
  it("retains the project install after prerequisites or another section", () => {
    const readme = fence("git clone https://github.com/acme/demo\nnpm install\npnpm add prerequisite\nnpm install another")
      + '\n## DSH 集成\n```bash\ndsh plugin add https://github.com/acme/demo.git#v1\n```';
    const commands = parseInstallCommands(readme).commands;
    const entry = { fullName: "acme/demo", type: "cordis-plugin", install: { commands } } as RankingsDocument["rankings"]["total"][number];
    expect(resolveSearchInstallTarget(entry)).toBe("github:acme/demo#v1");
  });
});

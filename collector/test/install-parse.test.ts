import { describe, expect, it } from "vitest";
import { parseInstallCommands } from "../src/install-parse.js";
import { resolveSearchInstallTarget } from "../src/search-index.js";
import type { RankingsDocument } from "../src/rankings.js";

const fence = (text: string) => `## 安装\n\`\`\`sh\n${text}\n\`\`\``;
describe("README installation extraction", () => {
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

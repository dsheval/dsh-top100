/**
 * 仓库特征检测：判断一个仓库是不是 DSH 插件，以及它的类型/安装方式
 *
 * 判据（按优先级，只基于根目录文件列表，零额外 API 调用）：
 * 1. 根目录有 SKILL.md            -> skill 型
 * 2. skills/ 目录含 SKILL.md      -> skill 型（技能集合仓库）
 * 3. 根目录有 dsh.profile 或 cordis.patch.yml -> cordis-plugin 型
 * 4. package.json 依赖含 cordis   -> cordis-plugin 型
 *
 * needsConfig 需要 README 内容，由调用方在抓取 README 后单独调用 detectNeedsConfig。
 */

import type { InstallMethod, PluginType } from "@dsh-top100/schema";
import { fetchRepoRoot, fetchFileViaApi, type RepoContentItem } from "./github.js";

export interface Detection {
  isPlugin: boolean;
  type: PluginType | null;
  installMethod: InstallMethod | null;
  /** 根目录发现的 skill 清单（技能集合仓库用） */
  skillFiles: string[];
  /** 检测依据说明（供报告） */
  evidence: string[];
}

const SKILL_MARKER = "SKILL.md";
const CORDIS_MARKERS = ["dsh.profile", "cordis.patch.yml", "dsh.profile.yml"];

export async function detectPlugin(
  fullName: string,
  rootItems: RepoContentItem[]
): Promise<Detection> {
  const evidence: string[] = [];
  const skillFiles: string[] = [];
  const names = new Set(rootItems.map((i) => i.name.toLowerCase()));

  // 1. 根目录 SKILL.md
  if (names.has(SKILL_MARKER.toLowerCase())) {
    evidence.push("root SKILL.md");
    skillFiles.push(SKILL_MARKER);
  }

  // 2. skills/ 目录（仅当根目录没有 SKILL.md 时探测，节省调用）
  if (skillFiles.length === 0) {
    const skillsDir = rootItems.find(
      (i) => i.type === "dir" && /^skills?$/i.test(i.name)
    );
    if (skillsDir) {
      const subItems = await fetchRepoRoot(fullName, undefined, skillsDir.path);
      const skillDocs = subItems.filter(
        (i) => i.type === "file" && i.name.toUpperCase() === "SKILL.MD"
      );
      if (skillDocs.length > 0) {
        evidence.push(`skills/ dir (${skillDocs.length} SKILL.md)`);
        skillFiles.push(...skillDocs.map((d) => d.path));
      }
    }
  }

  // 3. cordis 标记文件
  const hasCordisMarker = rootItems.some(
    (i) => i.type === "file" && CORDIS_MARKERS.includes(i.name.toLowerCase())
  );
  if (hasCordisMarker) evidence.push("cordis marker file");

  // 4. package.json 需要调用方抓取后调用 isCordisPackageJson 判定
  const hasPackageJson = names.has("package.json");
  if (hasPackageJson) evidence.push("has package.json");

  const isSkill = skillFiles.length > 0;
  const isCordis = hasCordisMarker || hasPackageJson; // package.json 需二次确认
  if (!isSkill && !isCordis) {
    return {
      isPlugin: false,
      type: null,
      installMethod: null,
      skillFiles: [],
      evidence,
    };
  }

  const type: PluginType = isSkill ? "skill" : "cordis-plugin";
  const installMethod: InstallMethod = type === "skill" ? "skills-add" : "pnpm-profile";

  return { isPlugin: true, type, installMethod, skillFiles, evidence };
}

/** 子目录 bundle 探测：根目录无插件标记时，检查是否存在"子目录内含 package.json + cordis 标记"的插件成品
 * （仓库根目录放素材/文档/工具链，插件在子目录——如 PC2005-cloud/dsh-pet 的 dsh-pet/）
 * 只探测可疑目录（与仓库同名 / dsh- 前缀 / cordis|plugin|bundle|client 开头），最多 3 个，控制 API 调用 */
export async function detectSubdirBundle(
  fullName: string,
  rootItems: RepoContentItem[],
  branch?: string | null
): Promise<{ subdir: string; evidence: string[] } | null> {
  const repoName = fullName.split("/")[1]?.toLowerCase();
  // 常见非插件目录直接跳过（素材/文档/构建目录）
  const SKIP_DIRS =
    /^(docs?|assets?|test|tests|scripts?|tools?|examples?|images?|img|public|src|lib|dist|node_modules|vendor|\.github)$/i;
  const dirs = rootItems.filter((i) => i.type === "dir" && !SKIP_DIRS.test(i.name));
  const candidates = dirs
    .filter((d) => {
      const n = d.name.toLowerCase();
      // 与仓库同名 / dsh 开头（含裸 dsh、dsh-、dsh_）/ cordis|plugin|bundle|client 开头
      return n === repoName || /^(dsh|cordis|plugin|bundle|client)/.test(n);
    })
    .slice(0, 3);
  for (const dir of candidates) {
    const items = await fetchRepoRoot(fullName, branch, dir.path);
    const names = new Set(items.map((i) => i.name.toLowerCase()));
    if (names.has("package.json")) {
      const hasMarker =
        names.has("cordis.patch.yml") ||
        names.has("dsh.profile") ||
        names.has("dsh.profile.yml");
      // 无批处理文件的子目录也可命中：package.json 依赖含 DSH/cordis 关键字（如 @deepseek-ai/dsh-tools）
      let depsCordis = false;
      if (!hasMarker) {
        const f = await fetchFileViaApi(fullName, `${dir.path}/package.json`);
        depsCordis = isCordisPackageJson(f?.content ?? null);
      }
      if (hasMarker || depsCordis) {
        return {
          subdir: dir.path,
          evidence: [
            hasMarker
              ? `subdir ${dir.path}/（package.json + cordis 标记）`
              : `subdir ${dir.path}/（package.json 含 DSH 依赖）`,
          ],
        };
      }
    }
  }
  return null;
}

const CORDIS_PKG_KEYWORDS = [
  "cordis",
  "@cordisjs/plugin",
  "dsh-base",
  "@deepseek-ai/dsh-",
];

/** package.json 内容是否为 cordis 插件：
 * 1. 依赖含 cordis 关键字（标准 cordis 插件）
 * 2. 有 dsh.bundle.patch 字段（DSH Bundle 结构，如 Code2Skill：cordis.patch.yml + skills）
 * 3. 有 dsh.client / dshClient 字段（纯 client 注入插件：无 host 代码，只声明 client 注入，
 *    如 dsh-read-history：dsh.client.platform + inject @deepseek-ai/dsh-client-*） */
export function isCordisPackageJson(content: string | null): boolean {
  if (!content) return false;
  try {
    const pkg = JSON.parse(content);
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    if (Object.keys(deps).some((d) =>
      CORDIS_PKG_KEYWORDS.some((k) => d.includes(k))
    )) return true;
    // DSH Bundle：package.json 的 dsh.bundle.patch 字段声明 cordis patch 文件
    if (pkg.dsh && typeof pkg.dsh === "object" && pkg.dsh.bundle?.patch) return true;
    // 纯 client 注入插件：dsh.client / dshClient 声明 client 注入（platform + inject）
    if (pkg.dsh && typeof pkg.dsh === "object" && pkg.dsh.client) return true;
    if (pkg.dshClient && typeof pkg.dshClient === "object") return true;
    return false;
  } catch {
    return false;
  }
}

/** 检测 README/SKILL 内容中的"需要配置"信号（具体环境变量名） */
const CONFIG_KEY_RE =
  /(?:^|[^A-Za-z])(GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|LLM_API_KEY|API_KEY|CLAUDE_API_KEY|AZURE_OPENAI|AWS_ACCESS_KEY|STRIPE_API_KEY|WEBHOOK_SECRET|SESSION_KEY)(?:[^A-Za-z]|$)/i;

/** 否定语境（"不需要 API key"等）——命中则先摘除，避免误报 */
const NEGATION_RE =
  /(?:不需要|无需|不用|免[^。；\n]{0,10}(?:配置|token|key)|no (?:api ?key|token|config|setup|configuration)|without (?:any )?(?:api ?key|token|config)|no configuration required|zero-?config|works (?:out of the box|without))/i;

export function detectNeedsConfig(readmeContent: string | null): boolean {
  if (!readmeContent) return false;
  const text = readmeContent.replace(NEGATION_RE, " ");
  return CONFIG_KEY_RE.test(text);
}

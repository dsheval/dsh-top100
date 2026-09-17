import { existingDshPrefix } from "./install-guide.js";

const catalogPrefix = "npx @deepseek-ai/dsh";
let selection = null;
let pending = false;

export function commandForExistingDsh(command, method, version = "") {
  const prefix = existingDshPrefix(method, version);
  if (!prefix || !command.startsWith(`${catalogPrefix} plugin --profile web add `)) return null;
  return prefix + command.slice(catalogPrefix.length);
}

// Keep the choice within this page only; never infer a local DSH installation.
export function chooseCatalogInstallCommand(command) {
  if (pending) return Promise.resolve(null);
  pending = true;
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "catalog-install-dialog";
    dialog.setAttribute("aria-labelledby", "catalog-install-title");
    dialog.innerHTML = `
      <h2 id="catalog-install-title">沿用你的 DSH</h2>
      <p>选择你平时的启动方式，安装到同一个 DSH Web 环境。</p>
      <form method="dialog">
        <label for="catalog-install-method">启动命令</label>
        <select id="catalog-install-method">
          <option value="">选择启动方式</option>
          <option value="global">dsh web</option>
          <option value="source">pnpm dsh web</option>
          <option value="npx">npx @deepseek-ai/dsh… web</option>
        </select>
        <div data-version-field hidden>
          <label for="catalog-install-version">你正在使用的 DSH 版本</label>
          <input id="catalog-install-version" placeholder="例如 0.1.5-rc.2" autocomplete="off" spellcheck="false" aria-describedby="catalog-install-status">
        </div>
        <p id="catalog-install-status" role="status"></p>
        <pre data-command-preview hidden></pre>
        <p data-location></p>
        <p>还没有 DSH？先查看<a href="?page=dsh#dsh">安装指南</a>。</p>
        <div class="catalog-install-actions">
          <button type="button" data-cancel>取消</button>
          <button type="submit" data-confirm disabled>复制安装命令</button>
        </div>
      </form>`;
    const method = dialog.querySelector("select");
    const version = dialog.querySelector("input");
    const confirm = dialog.querySelector("[data-confirm]");
    const preview = dialog.querySelector("[data-command-preview]");
    let chosen = null;
    let result = null;
    if (selection) { method.value = selection.method; version.value = selection.version; }
    function update() {
      const isNpx = method.value === "npx";
      dialog.querySelector("[data-version-field]").hidden = !isNpx;
      chosen = commandForExistingDsh(command, method.value, version.value);
      confirm.disabled = !chosen;
      preview.hidden = !chosen;
      preview.textContent = chosen ?? "";
      version.setAttribute("aria-invalid", String(isNpx && version.value !== "" && !chosen));
      dialog.querySelector("#catalog-install-status").textContent = chosen ? "" : isNpx
        ? "填写原启动命令或 DSH 版本信息中的完整版本号。" : "选择后生成安装命令。";
      dialog.querySelector("[data-location]").textContent = method.value === "source"
        ? "在原 DSH 源码仓库根目录执行，并保留原 DSH_HOME 等配置。"
        : "在原来启动 DSH 的终端环境中执行，并保留原 DSH_HOME 等配置。";
    }
    method.addEventListener("change", update);
    version.addEventListener("input", update);
    dialog.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      if (!chosen) return;
      selection = { method: method.value, version: version.value.trim() };
      result = chosen;
      dialog.close();
    });
    dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove(); pending = false; resolve(result);
    }, { once: true });
    document.body.appendChild(dialog);
    update();
    dialog.showModal();
  });
}

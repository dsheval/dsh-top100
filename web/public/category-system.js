export const CATEGORY_DEFINITIONS = Object.freeze([
  {
    id: "",
    label: "全部分类",
    description: "不限制功能分类，显示当前目录中的全部内容。",
    icon: '<path d="M4 5h16M4 12h16M4 19h16"/>',
  },
  {
    id: "ai",
    label: "Agent 增强",
    description: "模型能力、提示词、记忆、上下文、多 Agent 协作与智能体增强。",
    icon: '<path d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z"/><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"/>',
  },
  {
    id: "appearance",
    label: "外观",
    description: "主题、皮肤、界面组件、桌面体验、图标与可视化面板。",
    icon: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  },
  {
    id: "coding",
    label: "编程",
    description: "代码生成、调试、测试、代码审查、终端、Git 与开发辅助。",
    icon: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4l-3 16"/>',
  },
  {
    id: "knowledge",
    label: "知识获取",
    description: "联网搜索、浏览器检索、RAG、知识库、文档问答与研究。",
    icon: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z"/>',
  },
  {
    id: "tools",
    label: "工具",
    description: "自动化、工作流、连接器、文件处理、通知与效率工具。",
    icon: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-3-3 2.4-2.4Z"/>',
  },
  {
    id: "security",
    label: "安全",
    description: "权限、沙箱、审计、认证、隐私、密钥与安全防护。",
    icon: '<path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  },
]);

export function renderCategoryOptions(container, { activeId = "", describedBy } = {}) {
  const fragment = document.createDocumentFragment();
  for (const definition of CATEGORY_DEFINITIONS) {
    const button = document.createElement("button");
    button.className = "category-option";
    button.type = "button";
    button.dataset.category = definition.id;
    button.setAttribute("aria-pressed", String(definition.id === activeId));
    if (describedBy) button.setAttribute("aria-describedby", describedBy);

    const icon = document.createElement("span");
    icon.className = "category-icon";
    icon.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.innerHTML = definition.icon;
    icon.appendChild(svg);

    const label = document.createElement("span");
    label.className = "category-label";
    label.textContent = definition.label;

    const count = document.createElement("span");
    count.className = "category-count";
    count.dataset.categoryCount = definition.id;
    count.textContent = "—";

    button.append(icon, label, count);
    fragment.appendChild(button);
  }
  container.replaceChildren(fragment);
}

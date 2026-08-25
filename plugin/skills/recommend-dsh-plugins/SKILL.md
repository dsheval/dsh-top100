---
name: recommend-dsh-plugins
description: "Search the DSHeval dsh-Top100 catalog and recommend suitable DeepSeek Harness plugins or Skills. Use when the user asks which DSH plugin to install, requests plugin recommendations or comparisons, describes a capability they want to add, or asks questions such as ‘我该装哪个插件’, ‘推荐几个插件’, or ‘有没有能做某件事的插件’."
---

# Recommend DSH plugins

Find recommendations from the live DSHeval dsh-Top100 catalog instead of relying on memory.

## Workflow

1. Identify the user's goal and important constraints. Ask one short clarifying question only when a missing constraint would materially change the recommendation.
2. Call `dsh_top100_search` with a concise capability query. Keep useful product terms such as OCR, browser, memory, Git, security, or workflow.
3. If the first search returns no useful match, retry once with a shorter query or a Chinese/English synonym.
4. Recommend 3–5 results based primarily on functional fit. Use Stars, recent growth, category, installation support, and update signals as supporting evidence rather than choosing by Stars alone.
5. For every recommendation, state:
   - why it fits the stated need;
   - its type, category, Stars, and installation availability;
   - the repository link returned by the tool.
6. Mention that the results come from the DSHeval Top100 market and include its catalog link.

## Guardrails

- Never invent a plugin or claim a capability absent from the returned description, tags, topics, or categories.
- Say clearly when the catalog has no strong match and suggest a refined search.
- Treat `installed: true` as an existing installation and avoid recommending a duplicate install.
- Do not install anything unless the user explicitly asks to install it. When installation is requested, confirm the selected result before starting any state-changing action.
- Do not execute installation commands copied from a repository README.

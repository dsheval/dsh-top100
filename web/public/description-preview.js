// Both leaderboards keep the complete text; only the collapsed preview is clipped.
const observers = new WeakMap();
let nextDescriptionId = 0;
export function enhanceDescriptions(root) {
  observers.get(root)?.disconnect();
  const update = (text) => {
    const container = text.parentElement;
    const button = container.querySelector('.description-toggle');
    const expanded = container.classList.contains('is-expanded');
    button.hidden = !expanded && text.scrollHeight <= text.clientHeight + 1;
  };
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) update(target);
  });
  observers.set(root, observer);
  for (const container of root.querySelectorAll('.plugin-description, .skill-details .description')) {
    let text = container.querySelector('.description-text');
    if (!text) {
      text = document.createElement('span');
      text.className = 'description-text';
      text.id = `description-preview-${++nextDescriptionId}`;
      text.textContent = container.textContent;
      const button = document.createElement('button');
      button.className = 'description-toggle';
      button.type = 'button';
      button.hidden = true;
      button.textContent = '展开简介';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', text.id);
      button.addEventListener('click', () => {
        const expanded = container.classList.toggle('is-expanded');
        button.setAttribute('aria-expanded', String(expanded));
        button.textContent = expanded ? '收起简介' : '展开简介';
        update(text);
      });
      container.replaceChildren(text, button);
      container.classList.add('has-description-preview');
    }
    observer.observe(text);
    update(text);
  }
}

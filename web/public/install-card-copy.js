const button = document.querySelector(".install-console [data-copy-command]");

button?.addEventListener("click", async () => {
  const command = button.dataset.copyCommand;
  if (!command) return;
  button.disabled = true;
  let copied = false;
  try {
    await navigator.clipboard.writeText(command);
    copied = true;
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = command;
    fallback.readOnly = true;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      fallback.remove();
    }
  } finally {
    button.disabled = false;
    button.focus({ preventScroll: true });
    button.setAttribute("aria-live", "polite");
    button.textContent = copied ? "已复制" : "请手动复制";
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => { button.textContent = "复制"; }, 3000);
  }
});

let resetTimer;

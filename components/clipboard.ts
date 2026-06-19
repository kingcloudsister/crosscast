export async function copyToClipboard(text: string) {
  if (!text) {
    throw new Error("There is no text to copy.");
  }

  try {
    copyWithTextarea(text);
    return;
  } catch {
    // Fall through to the async Clipboard API. In embedded browsers this often
    // rejects, so the synchronous path above must run first while the click's
    // user activation is still available.
  }

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error("Copy failed. Select the post text and copy it manually.");
}

function copyWithTextarea(text: string) {
  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "0";
  textarea.style.top = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  window.focus();
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy failed. Select the post text and copy it manually.");
    }
  } finally {
    document.body.removeChild(textarea);

    if (selectedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }

    activeElement?.focus({ preventScroll: true });
  }
}

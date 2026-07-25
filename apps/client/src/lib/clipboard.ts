/**
 * Copy text to the clipboard, with a fallback for non-secure contexts.
 *
 * `navigator.clipboard` is only exposed in secure contexts (HTTPS or
 * localhost). Intranet / offline deployments are frequently served over plain
 * HTTP on a LAN address, where `navigator.clipboard` is `undefined` and the
 * async Clipboard API silently does nothing — which is why actions like
 * "Copy Agent context" appear to have no effect. In that case we fall back to
 * a hidden <textarea> + `document.execCommand("copy")`, which still works
 * over HTTP.
 *
 * Returns `true` when the text was copied, `false` otherwise, so callers can
 * show an accurate success / failure notification instead of always claiming
 * success.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const canUseAsyncClipboard =
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function" &&
    // `isSecureContext` is false on plain HTTP; force the legacy path there.
    (typeof window === "undefined" || window.isSecureContext);

  if (canUseAsyncClipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, document not focused, etc. Fall back below.
    }
  }

  return legacyCopyText(text);
}

function legacyCopyText(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  // Keep it out of the viewport without triggering a scroll jump or iOS zoom.
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  // Preserve any existing user selection so copying does not disrupt it.
  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }

  document.body.removeChild(textarea);

  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }

  return succeeded;
}

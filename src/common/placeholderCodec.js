const placeholderPaths = new Set(["/replaced/index.html", "/replaced/replaced.html"]);

export function encodePlaceholder(state, title, targetUrl, favIconUrl, theme) {
  const readerPrefix = "about:reader?url=";
  const original = String(targetUrl ?? "");
  const readerMode = original.startsWith(readerPrefix);
  let destination = original;
  if (readerMode) {
    const rawTarget = original.slice(readerPrefix.length);
    // Preserve historical unescaped Reader Mode URLs, including embedded ampersands.
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawTarget)) {
      destination = rawTarget;
    } else {
      try {
        destination = new URL(original).searchParams.get("url") ?? rawTarget;
      } catch {
        destination = rawTarget;
      }
    }
  }
  const parameters = new URLSearchParams();
  parameters.set("state", String(state ?? ""));
  parameters.set("title", String(title ?? ""));
  parameters.set("url", destination);
  parameters.set("favIconUrl", String(favIconUrl ?? ""));
  if (readerMode) parameters.set("openInReaderMode", "true");
  parameters.set("theme", String(theme ?? "system"));
  return `replaced/index.html?${parameters.toString()}`;
}

export function parsePlaceholder(input, canonicalUrl) {
  const empty = { isReplaced: false };
  if (typeof input !== "string" || typeof canonicalUrl !== "string") return empty;
  try {
    const actual = new URL(input);
    const canonical = new URL(canonicalUrl);
    const originalPath = canonical.pathname;
    const legacyPath = originalPath.replace(/index\.html$/, "replaced.html");
    if (actual.protocol !== canonical.protocol || actual.host !== canonical.host ||
        !placeholderPaths.has(actual.pathname) ||
        (actual.pathname !== originalPath && actual.pathname !== legacyPath)) {
      return empty;
    }
    const result = { isReplaced: true };
    for (const key of ["state", "title", "url", "favIconUrl", "openInReaderMode", "theme"]) {
      result[key] = actual.searchParams.get(key) ?? "";
    }
    return result;
  } catch {
    return empty;
  }
}

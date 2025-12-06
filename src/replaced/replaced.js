import browser from "webextension-polyfill";
import "./replaced.scss";

const sanitaize = {
  encode: str => {
    str = str || "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },
  decode: str => {
    str = str || "";
    return str
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }
};

function returnReplaceParameter(url) {
  const parameter = {};
  const query = url.split("?")[1] || "";
  const paras = query.split("&");

  for (const p of paras) {
    if (!p) continue;
    const [key, value = ""] = p.split("=");
    parameter[key] = decodeURIComponent(value);
  }

  return parameter;
}

// Parse parameters once
const parameter = returnReplaceParameter(location.href);

// Resolve the original URL in one place
function resolveOriginalUrl() {
  // Prefer the explicit url parameter
  let originalUrl = parameter.url || "";

  // Some older cases might only put the URL into title
  if (!originalUrl && parameter.title) {
    originalUrl = parameter.title;
  }

  // Fallback to the input value once the DOM is ready, if needed
  const inputEl = document.querySelector(".replacedUrl");
  if (!originalUrl && inputEl && inputEl.value) {
    originalUrl = inputEl.value;
  }

  // Clean leading and trailing single quotes if present
  if (originalUrl.startsWith("'") && originalUrl.endsWith("'")) {
    originalUrl = originalUrl.slice(1, -1);
  }

  const isHttpLike = /^https?:\/\//i.test(originalUrl);

  return {
    originalUrl,
    isHttpLike
  };
}

// Try to open the original URL in this tab
function openOriginalUrl() {
  const { originalUrl, isHttpLike } = resolveOriginalUrl();

  if (!originalUrl || !isHttpLike) {
    return;
  }

  try {
    // Simple loop guard: only try once per URL in this tab
    const key = "tsm_replaced_redirected";
    const prev = sessionStorage.getItem(key);
    if (prev === originalUrl) {
      return;
    }
    sessionStorage.setItem(key, originalUrl);
  } catch (e) {
    // If sessionStorage is blocked for some reason, just fall through
  }

  // Let the browser decide whether navigation is allowed
  location.href = originalUrl;
}

// Initial page setup
document.title = parameter.title;
document.getElementsByClassName("title")[0].innerText = parameter.title;
document.getElementsByClassName("replacedUrl")[0].value = parameter.url;

if (parameter.favIconUrl === "" || parameter.favIconUrl === "undefined") {
  parameter.favIconUrl = "../icons/nofavicon.png";
}

document.head.insertAdjacentHTML(
  "beforeend",
  `<link rel="shortcut icon" href="${sanitaize.encode(parameter.favIconUrl)}">`
);

document.body.dataset.theme = parameter.theme || "light";

if (parameter.state === "open_faild") {
  document.getElementsByClassName("replacedPageMessage")[0].innerText =
    browser.i18n.getMessage("replacedPageMessage");
}

// Copy URL button behavior:
// - Copy to clipboard (existing behavior)
// - Also try to navigate to the original URL
const copy = () => {
  const urlInput = document.querySelector(".replacedUrl");
  if (urlInput) {
    urlInput.select();
    document.execCommand("Copy");
  }

  document.querySelector(".copyButton").innerText =
    browser.i18n.getMessage("copiedLabel");

  // After copying, attempt to open the original URL in this tab
  try {
    openOriginalUrl();
  } catch (e) {
    // If navigation fails or is blocked, user still has URL on clipboard
    console.error("Navigation after Copy URL failed", e);
  }
};

document.querySelector(".copyButton").onclick = copy;
document.querySelector(".copyButton").innerText =
  browser.i18n.getMessage("copyUrlLabel");

// Optional auto open on load for normal web URLs.
// This can help in cases where state is not propagated correctly.
try {
  const { originalUrl, isHttpLike } = resolveOriginalUrl();
  if (originalUrl && isHttpLike) {
    openOriginalUrl();
  }
} catch (e) {
  console.error("Auto open on replaced page failed", e);
}

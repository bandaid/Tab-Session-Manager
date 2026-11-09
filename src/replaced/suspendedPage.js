import "./suspendedPage.scss";

const MESSAGE_TIMEOUT_MS = 1800;
const READY_ATTEMPTS = 3;
const READY_RETRY_DELAY_MS = 350;
const initializedDocuments = new WeakSet();

async function requestBackground(browser, message, timeoutMs) {
  let timeoutId;
  const response = Promise.resolve()
    .then(() => browser.runtime.sendMessage({ message }))
    .catch(() => false);
  const timeout = new Promise(resolve => {
    timeoutId = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return (await Promise.race([response, timeout])) === true;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function requestPlaceholderOpen(browser, timeoutMs = MESSAGE_TIMEOUT_MS) {
  return requestBackground(browser, "placeholderOpen", timeoutMs);
}

export function initSuspendedPage(browser, parameters, pageDocument, pageLocation, options = {}) {
  if (initializedDocuments.has(pageDocument)) return;
  const timeoutMs = options.timeoutMs ?? MESSAGE_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? READY_RETRY_DELAY_MS;
  const readyAttempts = options.readyAttempts ?? READY_ATTEMPTS;
  let destination;
  try {
    destination = new URL(parameters?.url || "");
  } catch {
    destination = null;
  }
  const canOpenDirectly = destination !== null && ["http:", "https:"].includes(destination.protocol);

  const destinationLabel = pageDocument.createElement("p");
  destinationLabel.id = "tsm-suspended-destination";
  destinationLabel.textContent = canOpenDirectly && destination.hostname
    ? `Suspended destination: ${destination.hostname}`
    : "Suspended browser tab";

  const button = pageDocument.createElement("button");
  button.type = "button";
  button.id = "tsm-suspended-open";
  button.textContent = "Load page";
  button.setAttribute("aria-label", "Load suspended tab now");

  const feedback = pageDocument.createElement("p");
  feedback.id = "tsm-suspended-feedback";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  if (parameters?.state === "open_faild") {
    feedback.textContent = "The previous opening attempt failed. Select Load page to retry, or Copy URL.";
  }

  const anchor = pageDocument.querySelector(".copyButton");
  const container = pageDocument.createElement("div");
  container.id = "tsm-suspended-actions";
  container.append(destinationLabel, button, feedback);
  (anchor?.parentNode || pageDocument.body).append(container);

  let activeEpoch = 0;
  let readyCount = 0;
  let readyTimer;
  let manualRequested = false;
  let directFallback = false;
  let lastVisibility = null;

  // A visibility epoch prevents stale responses from restarting retries after tab switches.
  const invalidateReady = () => {
    activeEpoch++;
    clearTimeout(readyTimer);
    readyTimer = undefined;
  };

  const attemptReady = async epoch => {
    if (epoch !== activeEpoch || manualRequested || pageDocument.visibilityState !== "visible") return;
    readyCount++;
    const opened = await requestBackground(browser, "placeholderReady", timeoutMs);
    if (opened || epoch !== activeEpoch || manualRequested || pageDocument.visibilityState !== "visible") return;
    if (readyCount >= readyAttempts) {
      feedback.textContent = "Automatic opening was not confirmed. Select Load page to retry, or Copy URL.";
      return;
    }
    const pause = retryDelayMs * Math.pow(2, readyCount - 1);
    readyTimer = setTimeout(() => {
      readyTimer = undefined;
      void attemptReady(epoch);
    }, pause);
  };

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    manualRequested = true;
    invalidateReady();
    if (directFallback) {
      if (!canOpenDirectly) return;
      try {
        pageLocation.replace(destination.href);
        feedback.textContent = "Opening the original URL directly...";
      } catch {
        feedback.textContent = "Direct opening was blocked. Copy the URL to open it manually.";
      }
      return;
    }
    button.disabled = true;
    feedback.textContent = "Requesting page activation...";
    const opened = await requestPlaceholderOpen(browser, timeoutMs);
    button.disabled = false;
    if (opened) {
      feedback.textContent = "Navigation requested. Select Load page again if this page remains visible.";
      return;
    }
    if (canOpenDirectly) {
      directFallback = true;
      button.textContent = "Open directly";
      button.setAttribute("aria-label", "Open the suspended URL directly");
      feedback.textContent = "Background opening was not confirmed. Open directly or copy the URL.";
    } else {
      feedback.textContent = "Automatic opening is unavailable. Copy the URL to open it manually.";
    }
  });

  initializedDocuments.add(pageDocument);
  if (parameters?.state === "redirect") {
    const notifyWhenVisible = () => {
      const visible = pageDocument.visibilityState === "visible";
      if (visible === lastVisibility) return;
      lastVisibility = visible;
      invalidateReady();
      if (manualRequested || !visible) return;
      readyCount = 0;
      void attemptReady(activeEpoch);
    };
    pageDocument.addEventListener("visibilitychange", notifyWhenVisible);
    notifyWhenVisible();
  }
}

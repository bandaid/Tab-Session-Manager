/* Bounded tab-creation coordinator. All state is scoped to a single restore request. */
export async function restoreTabs(tabs, createTab, options = {}) {
  if (!Array.isArray(tabs)) throw new TypeError("tabs must be an array");
  if (typeof createTab !== "function") throw new TypeError("createTab must be a function");

  const { pauseAfter = 8, pauseMs = 40, sleep = delay, onFailure } = options;
  if (!Number.isSafeInteger(pauseAfter) || pauseAfter < 1) {
    throw new RangeError("pauseAfter must be a positive integer");
  }
  if (!Number.isFinite(pauseMs) || pauseMs < 0) {
    throw new RangeError("pauseMs must be a nonnegative finite number");
  }
  if (typeof sleep !== "function") throw new TypeError("sleep must be a function");
  if (onFailure !== undefined && typeof onFailure !== "function") {
    throw new TypeError("onFailure must be a function");
  }

  let succeeded = 0;
  let failed = 0;
  for (let index = 0; index < tabs.length; index++) {
    try {
      await createTab(tabs[index], index);
      succeeded++;
    } catch (error) {
      failed++;
      if (onFailure) {
        try {
          onFailure(index, error);
        } catch (_) {
          // Diagnostics must never alter restoration success or failure accounting.
        }
      }
    }
    if ((index + 1) % pauseAfter === 0 && index + 1 < tabs.length && pauseMs) {
      await sleep(pauseMs);
    }
  }
  return { requested: tabs.length, succeeded, failed };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

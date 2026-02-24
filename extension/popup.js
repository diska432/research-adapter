async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function resolveActualPdfUrl(tabUrl) {
  try {
    const u = new URL(tabUrl);
    const fileParam = u.searchParams.get("file");
    if (fileParam) {
      const real = decodeURIComponent(fileParam);
      if (real.startsWith("http://") || real.startsWith("https://")) return real;
    }
  } catch {}
  return tabUrl;
}

async function init() {
  const statusEl = document.getElementById("status");
  const serverInput = document.getElementById("serverUrl");
  const maxWordsInput = document.getElementById("maxWords");
  const llmModelInput = document.getElementById("llmModel");
  const tokenLimitInput = document.getElementById("tokenLimit");
  const btn = document.getElementById("summarizeBtn");

  const stored = await chrome.storage.sync.get(["serverUrl", "maxWords", "llmModel", "tokenLimit"]);
  if (stored.serverUrl) serverInput.value = stored.serverUrl;
  if (stored.maxWords) maxWordsInput.value = stored.maxWords;
  if (stored.llmModel) llmModelInput.value = stored.llmModel;
  if (stored.tokenLimit) tokenLimitInput.value = stored.tokenLimit;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "status") {
      if (msg.type === "error") {
        statusEl.textContent = `Error: ${msg.message}`;
        btn.disabled = false;
      } else if (msg.type === "done") {
        statusEl.textContent = msg.message;
      } else {
        statusEl.textContent = msg.message;
      }
    }
  });

  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      statusEl.textContent = "Resolving PDF URL...";

      const tab = await getActiveTab();
      const pdfUrl = resolveActualPdfUrl(tab.url);

      const serverUrl = serverInput.value || "https://research-adapter.onrender.com";
      const maxWords = Math.max(100, Math.min(1200, parseInt(maxWordsInput.value || "500", 10)));
      const llmModel = llmModelInput.value || "gemini-1.5-flash";
      const tokenLimit = Math.max(200, Math.min(2000, parseInt(tokenLimitInput.value || "800", 10)));
      await chrome.storage.sync.set({ serverUrl, maxWords, llmModel, tokenLimit });

      chrome.runtime.sendMessage({
        action: "summarize",
        pdfUrl,
        serverUrl,
        maxWords,
        llmModel,
        tokenLimit,
        tabId: tab.id,
      });

      statusEl.textContent = "Summarizing in background — you can close this popup.";
    } catch (e) {
      console.error(e);
      statusEl.textContent = `Error: ${e.message}`;
      btn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

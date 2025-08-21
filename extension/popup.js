async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function fetchPdfBytesFromTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  const blob = await res.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, url };
}

async function summarize(bytes, serverUrl, maxWords, useLlm, llmModel, tokenLimit) {
  const form = new FormData();
  const file = new File([bytes], "document.pdf", { type: "application/pdf" });
  form.append("file", file);
  const url = new URL(`${serverUrl.replace(/\/$/, "")}/summarize`);
  url.searchParams.set("max_words", String(maxWords));
  if (useLlm) {
    url.searchParams.set("llm", "true");
    if (llmModel) url.searchParams.set("model", llmModel);
    if (tokenLimit) url.searchParams.set("token_limit", String(tokenLimit));
  }
  const resp = await fetch(url.toString(), { method: "POST", body: form });
  if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
  return await resp.json();
}

function openViewer(summaryPayload) {
  const url = chrome.runtime.getURL("viewer.html");
  const query = encodeURIComponent(JSON.stringify(summaryPayload));
  chrome.tabs.create({ url: `${url}?data=${query}` });
}

async function init() {
  const statusEl = document.getElementById("status");
  const serverInput = document.getElementById("serverUrl");
  const maxWordsInput = document.getElementById("maxWords");
  const useLlmInput = document.getElementById("useLlm");
  const llmModelInput = document.getElementById("llmModel");
  const tokenLimitInput = document.getElementById("tokenLimit");
  const btn = document.getElementById("summarizeBtn");

  const stored = await chrome.storage.sync.get(["serverUrl", "maxWords", "useLlm", "llmModel", "tokenLimit"]);
  if (stored.serverUrl) serverInput.value = stored.serverUrl;
  if (stored.maxWords) maxWordsInput.value = stored.maxWords;
  if (typeof stored.useLlm === "boolean") useLlmInput.checked = stored.useLlm;
  if (stored.llmModel) llmModelInput.value = stored.llmModel;
  if (stored.tokenLimit) tokenLimitInput.value = stored.tokenLimit;

  btn.addEventListener("click", async () => {
    try {
      statusEl.textContent = "Fetching PDF...";
      const tab = await getActiveTab();
      const { bytes, url } = await fetchPdfBytesFromTab(tab.id);

      const serverUrl = serverInput.value || "http://localhost:8000";
      const maxWords = Math.max(100, Math.min(1200, parseInt(maxWordsInput.value || "500", 10)));
      const useLlm = !!useLlmInput.checked;
      const llmModel = llmModelInput.value || "gpt-4o-mini";
      const tokenLimit = Math.max(200, Math.min(2000, parseInt(tokenLimitInput.value || "800", 10)));
      await chrome.storage.sync.set({ serverUrl, maxWords, useLlm, llmModel, tokenLimit });

      statusEl.textContent = "Summarizing...";
      const result = await summarize(bytes, serverUrl, maxWords, useLlm, llmModel, tokenLimit);
      statusEl.textContent = "Opening viewer...";
      openViewer({ summary: result.summary, stats: result.stats, llm: result.llm_summary || null, pdfUrl: url });
      window.close();
    } catch (e) {
      console.error(e);
      statusEl.textContent = `Error: ${e.message}`;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function resolveActualPdfUrl(tabUrl) {
  try {
    const u = new URL(tabUrl);
    // Chrome built-in pdf viewer often like: chrome-extension://.../index.html?file=<encoded PDF URL>
    const fileParam = u.searchParams.get("file");
    if (fileParam) {
      const real = decodeURIComponent(fileParam);
      if (real.startsWith("http://") || real.startsWith("https://")) return real;
    }
  } catch {}
  return tabUrl;
}

async function fetchPdfBytesFromTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const resolvedUrl = resolveActualPdfUrl(tab.url);
  const res = await fetch(resolvedUrl);
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("pdf")) {
    // Fallback: may be HTML wrapper. Try to extract <embed src> via scripting.
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const embed = document.querySelector('embed[type="application/pdf"], iframe');
        return embed ? embed.getAttribute('src') : null;
      }
    });
    if (result) {
      const abs = new URL(result, tab.url).toString();
      const r2 = await fetch(abs);
      if (!r2.ok) throw new Error(`Failed to fetch PDF (embed): ${r2.status}`);
      const b2 = await r2.blob();
      const bytes2 = new Uint8Array(await b2.arrayBuffer());
      return { bytes: bytes2, url: abs };
    }
  }
  const blob = await res.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, url: resolvedUrl };
}

async function summarize(bytes, serverUrl, maxWords, llmModel, tokenLimit) {
  const form = new FormData();
  const file = new File([bytes], "document.pdf", { type: "application/pdf" });
  form.append("file", file);
  const url = new URL(`${serverUrl.replace(/\/$/, "")}/summarize`);
  url.searchParams.set("max_words", String(maxWords));
  url.searchParams.set("llm", "true");  // Always use LLM
  if (llmModel) url.searchParams.set("model", llmModel);
  if (tokenLimit) url.searchParams.set("token_limit", String(tokenLimit));
  
  const resp = await fetch(url.toString(), { method: "POST", body: form });
  if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
  const result = await resp.json();
  
  console.log("Backend response:", result);
  
  // Check for backend errors
  if (result.error) {
    throw new Error(`Backend processing error: ${result.error}`);
  }
  
  // Check for empty summary
  if (!result.summary || result.summary.length === 0) {
    throw new Error(`No summary generated. Backend stats: ${JSON.stringify(result.stats)}`);
  }
  
  return result;
}

function openViewer(summaryPayload) {
  console.log("Opening viewer with payload:", summaryPayload);
  const url = chrome.runtime.getURL("viewer.html");
  const query = encodeURIComponent(JSON.stringify(summaryPayload));
  chrome.tabs.create({ url: `${url}?data=${query}` });
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

  btn.addEventListener("click", async () => {
    try {
      statusEl.textContent = "Fetching PDF...";
      const tab = await getActiveTab();
      const { bytes, url } = await fetchPdfBytesFromTab(tab.id);

      const serverUrl = serverInput.value || "https://research-adapter.onrender.com";
      const maxWords = Math.max(100, Math.min(1200, parseInt(maxWordsInput.value || "500", 10)));
      const llmModel = llmModelInput.value || "gemini-1.5-flash";
      const tokenLimit = Math.max(200, Math.min(2000, parseInt(tokenLimitInput.value || "800", 10)));
      await chrome.storage.sync.set({ serverUrl, maxWords, llmModel, tokenLimit });

      statusEl.textContent = "Summarizing...";
      const result = await summarize(bytes, serverUrl, maxWords, llmModel, tokenLimit);
      statusEl.textContent = "Opening viewer...";
      
      const payload = { 
        summary: result.summary, 
        stats: result.stats, 
        llm: result.llm_summary || null, 
        pdfUrl: url 
      };
      console.log("Final payload being sent to viewer:", payload);
      openViewer(payload);
      window.close();
    } catch (e) {
      console.error(e);
      statusEl.textContent = `Error: ${e.message}`;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

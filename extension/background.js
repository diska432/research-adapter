chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "summarize") {
    handleSummarize(msg).catch((err) => {
      console.error("Background summarize failed:", err);
      broadcastStatus("error", err.message);
    });
    sendResponse({ started: true });
  }
  return true;
});

async function handleSummarize({ pdfUrl, serverUrl, maxWords, llmModel, tokenLimit, tabId }) {
  broadcastStatus("progress", "Fetching PDF...");

  let resolvedUrl = pdfUrl;

  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      resolvedUrl = resolveActualPdfUrl(tab.url);
    } catch {}
  }

  const pdfRes = await fetch(resolvedUrl);
  if (!pdfRes.ok) throw new Error(`Failed to fetch PDF: ${pdfRes.status}`);

  let blob = await pdfRes.blob();
  const ct = pdfRes.headers.get("content-type") || "";

  if (!ct.includes("pdf") && tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const embed = document.querySelector('embed[type="application/pdf"], iframe');
        return embed ? embed.getAttribute("src") : null;
      },
    });
    if (result) {
      const tab = await chrome.tabs.get(tabId);
      const abs = new URL(result, tab.url).toString();
      const r2 = await fetch(abs);
      if (!r2.ok) throw new Error(`Failed to fetch PDF (embed): ${r2.status}`);
      blob = await r2.blob();
      resolvedUrl = abs;
    }
  }

  broadcastStatus("progress", "Summarizing with AI...");

  const form = new FormData();
  form.append("file", new File([blob], "document.pdf", { type: "application/pdf" }));

  const url = new URL(`${serverUrl.replace(/\/$/, "")}/summarize`);
  url.searchParams.set("max_words", String(maxWords));
  url.searchParams.set("llm", "true");
  if (llmModel) url.searchParams.set("model", llmModel);
  if (tokenLimit) url.searchParams.set("token_limit", String(tokenLimit));

  const resp = await fetch(url.toString(), { method: "POST", body: form });
  if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);

  const result = await resp.json();
  if (result.error) throw new Error(`Backend processing error: ${result.error}`);
  if (!result.summary || result.summary.length === 0) {
    throw new Error(`No summary generated. Backend stats: ${JSON.stringify(result.stats)}`);
  }

  broadcastStatus("progress", "Opening viewer...");

  const payload = {
    summary: result.summary,
    stats: result.stats,
    llm: result.llm_summary || null,
    pdfUrl: resolvedUrl,
  };

  const summaryKey = `summary_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  await chrome.storage.local.set({ [summaryKey]: payload });

  const viewerUrl = chrome.runtime.getURL("viewer.html");
  await chrome.tabs.create({ url: `${viewerUrl}?key=${encodeURIComponent(summaryKey)}` });

  broadcastStatus("done", "Summary ready!");
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

function broadcastStatus(type, message) {
  chrome.runtime.sendMessage({ action: "status", type, message }).catch(() => {});
}

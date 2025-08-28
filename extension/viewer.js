function getQueryData() {
  const url = new URL(window.location.href);
  const dataStr = url.searchParams.get("data");
  if (!dataStr) return null;
  try { 
    const parsed = JSON.parse(decodeURIComponent(dataStr));
    console.log("Viewer received data:", parsed);
    return parsed;
  } catch (e) { 
    console.error("Failed to parse viewer data:", e);
    return null; 
  }
}

function openPdfAtPage(pdfUrl, page, queryText) {
  if (!pdfUrl) return;
  const url = new URL(pdfUrl);
  url.hash = `page=${page}`;
  if (queryText && queryText.length > 0) {
    // Built-in viewer supports find=, some viewers use search=; set both.
    const encoded = encodeURIComponent(queryText.slice(0, 200));
    url.hash += `&find=${encoded}&search=${encoded}`;
  }
  chrome.tabs.create({ url: url.toString() });
}

function renderLlmSummary(llm) {
  const el = document.getElementById("llmSummary");
  if (!el) return;
  el.textContent = llm ? llm : "";
}

function renderSummary(summary, stats, pdfUrl) {
  console.log("Rendering summary:", { summary, stats, pdfUrl });
  
  const meta = document.getElementById("meta");
  meta.textContent = `${stats.num_sentences} sentences, from ${stats.num_pages} pages (budget ${stats.max_words} words)`;
  const list = document.getElementById("summaryList");
  const empty = document.getElementById("empty");
  list.innerHTML = "";
  
  if (!summary || summary.length === 0) {
    console.log("No summary items to render");
    if (empty) empty.style.display = "block";
    return;
  }
  
  console.log(`Rendering ${summary.length} summary items`);
  if (empty) empty.style.display = "none";
  
  summary.forEach((item, index) => {
    console.log(`Item ${index}:`, item);
    const li = document.createElement("li");
    li.dataset.page = String(item.page);
    li.title = `Click to go to page ${item.page} (double-click for context)`;

    const text = document.createElement("span");
    text.textContent = item.text;

    const page = document.createElement("span");
    page.className = "page";
    page.textContent = `(p. ${item.page})`;

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = `score: ${item.score.toFixed(2)}`;

    li.appendChild(text);
    li.appendChild(page);
    li.appendChild(score);

    // Single click: navigate current active tab to the page
    li.addEventListener("click", async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab && tab.url) {
          const url = new URL(tab.url);
          url.hash = `page=${item.page}`;
          chrome.tabs.update(tab.id, { url: url.toString() });
        }
      } catch (e) {
        console.error(e);
      }
    });

    // Double click: open new tab at the page with search highlighting
    li.addEventListener("dblclick", () => {
      openPdfAtPage(pdfUrl, item.page, item.text);
    });

    list.appendChild(li);
  });
}

(function init(){
  console.log("Viewer initializing...");
  const payload = getQueryData();
  if (!payload) {
    console.error("No payload received");
    return;
  }
  
  console.log("Processing payload:", payload);
  renderLlmSummary(payload.llm || "");
  renderSummary(
    payload.summary || [],
    payload.stats || { num_sentences: 0, num_pages: 0, max_words: 0 },
    payload.pdfUrl || null
  );
})();

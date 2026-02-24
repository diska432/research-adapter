const KATEX_AUTO_RENDER_OPTIONS = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false },
  ],
  throwOnError: false,
};

function renderRichText(container, rawText) {
  const html = marked.parse(rawText);
  container.innerHTML = html;
  renderMathInElement(container, KATEX_AUTO_RENDER_OPTIONS);
}

function renderRichInline(container, rawText) {
  const html = marked.parseInline(rawText);
  container.innerHTML = html;
  renderMathInElement(container, KATEX_AUTO_RENDER_OPTIONS);
}

async function getQueryData() {
  const url = new URL(window.location.href);

  const key = url.searchParams.get("key");
  if (key) {
    try {
      const result = await chrome.storage.local.get(key);
      const data = result[key];
      if (data) {
        console.log("Viewer received data from storage:", data);
        chrome.storage.local.remove(key);
        return data;
      }
    } catch (e) {
      console.error("Failed to retrieve data from storage:", e);
    }
  }

  const dataStr = url.searchParams.get("data");
  if (dataStr) {
    try {
      const parsed = JSON.parse(decodeURIComponent(dataStr));
      console.log("Viewer received data from URL:", parsed);
      return parsed;
    } catch (e) {
      console.error("Failed to parse viewer data:", e);
    }
  }

  return null;
}

function openPdfAtPage(pdfUrl, page, queryText) {
  if (!pdfUrl) return;
  const url = new URL(pdfUrl);
  url.hash = `page=${page}`;
  if (queryText && queryText.length > 0) {
    const encoded = encodeURIComponent(queryText.slice(0, 200));
    url.hash += `&find=${encoded}&search=${encoded}`;
  }
  chrome.tabs.create({ url: url.toString() });
}

function renderLlmSummary(llm) {
  const el = document.getElementById("llmSummary");
  if (!el) return;
  if (!llm) {
    el.textContent = "";
    return;
  }
  renderRichText(el, llm);
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
    text.className = "item-text";
    renderRichInline(text, item.text);

    const page = document.createElement("span");
    page.className = "page";
    page.textContent = `(p. ${item.page})`;

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = `score: ${item.score.toFixed(2)}`;

    li.appendChild(text);
    li.appendChild(page);
    li.appendChild(score);

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

    li.addEventListener("dblclick", () => {
      openPdfAtPage(pdfUrl, item.page, item.text);
    });

    list.appendChild(li);
  });
}

function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  const saved = localStorage.getItem("theme");
  if (saved === "dark") document.body.classList.add("dark");
  btn.textContent = document.body.classList.contains("dark") ? "\u2600" : "\u263E";

  btn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    btn.textContent = isDark ? "\u2600" : "\u263E";
  });
}

(async function init() {
  console.log("Viewer initializing...");
  initThemeToggle();

  const payload = await getQueryData();
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

# ResearchAdapter: PDF Summarizer with Source Alignment

This project provides a Chrome extension and a Python FastAPI backend to generate a concise summary of research PDFs with clickable references that navigate to the source page.

## Prerequisites
- Python 3.12
- Google Chrome (or Chromium-based)
- macOS/Linux/Windows

## Backend Setup
1. Create and activate a virtual environment:
```bash
python3.12 -m venv .venv
source .venv/bin/activate
```
2. Install dependencies:
```bash
pip install -U pip
pip install -r server/requirements.txt
```
3. Configure Gemini API:
   - Create `server/.env` with:
```
GEMINI_API_KEY=...
```
4. Run the server:
```bash
uvicorn server.main:app --host 0.0.0.0 --port 8000
```
5. Check health in a browser: `http://localhost:8000/health`

## Extension Setup (Chrome MV3)
1. Open Chrome -> go to `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select the `extension/` folder.
4. Pin the "ResearchAdapter Summarizer" extension.

## Usage
1. Open a PDF in Chrome (e.g., `https://arxiv.org/pdf/1706.03762.pdf`).
2. Click the extension icon.
3. Set the backend URL (default `http://localhost:8000`) and word budget.
4. Click "Summarize". A viewer opens with an LLM summary (if enabled) and the extractive evidence below. Click a sentence to jump; double-click to open the PDF to that page with search highlighting.

## Notes & Limitations
- Some PDF servers block cross-origin fetches from the extension. If so, open the direct `.pdf` URL or save locally.
- Large PDFs may take several seconds to process.

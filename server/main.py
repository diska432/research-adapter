from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
import uvicorn
import logging
from typing import List, Dict, Any, Optional

from .summarizer.pdf_extractor import extract_pages
from .summarizer.llm_summarizer import llm_summarize_pdf

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(default_response_class=ORJSONResponse)

app.add_middleware(	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
	return {"status": "ok"}


@app.post("/summarize")
async def summarize(
	file: UploadFile = File(...),
	max_words: int = Query(default=500),
	llm: bool = Query(default=True),  # Default to True for pure LLM approach
	model: Optional[str] = Query(default="gemini-1.5-flash"),
	token_limit: int = Query(default=800),
) -> Dict[str, Any]:
	logger.info(f"Starting summarization: max_words={max_words}, llm={llm}, model={model}, token_limit={token_limit}")
	
	try:
		content: bytes = await file.read()
		logger.info(f"Read {len(content)} bytes from PDF")
		
		pages = extract_pages(content)
		logger.info(f"Extracted {len(pages)} pages")
		
		if not pages:
			logger.warning("No pages extracted from PDF")
			return {"summary": [], "stats": {"num_pages": 0, "num_sentences": 0, "max_words": max_words, "method": "none"}}

		# Log page info for debugging
		total_sentences = sum(len(p.get("sentences", [])) for p in pages)
		logger.info(f"Total sentences across all pages: {total_sentences}")
		
		if llm:
			try:
				logger.info("Starting Gemini LLM summarization")
				result = llm_summarize_pdf(pages, model=model or "gemini-1.5-flash", token_limit=token_limit)
				logger.info("Gemini LLM summarization completed successfully")
				return result
			except Exception as e:
				logger.error(f"Gemini LLM summarization failed: {e}")
				return {"error": str(e), "summary": [], "stats": {"num_pages": len(pages), "num_sentences": 0, "max_words": max_words, "method": "failed"}}
		else:
			# Fallback: return first few sentences from each page
			fallback_summary = []
			for page in pages[:3]:  # First 3 pages
				sentences = page.get("sentences", [])[:3]  # First 3 sentences per page
				for sent in sentences:
					fallback_summary.append({
						"text": sent,
						"page": page.get("page", 1),
						"score": 0.5
					})
			return {
				"summary": fallback_summary,
				"stats": {
					"num_pages": len(pages),
					"num_sentences": len(fallback_summary),
					"max_words": max_words,
					"method": "fallback"
				}
			}
		
	except Exception as e:
		logger.error(f"Summarization failed: {e}", exc_info=True)
		return {"error": str(e), "summary": [], "stats": {"num_pages": 0, "num_sentences": 0, "max_words": max_words, "method": "error"}}


if __name__ == "__main__":
	uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
import uvicorn
from typing import List, Dict, Any, Optional

from .summarizer.pdf_extractor import extract_pages
from .summarizer.summarizer import summarize_sentences
from .summarizer.aligner import align_summary_to_pages
from .summarizer.llm_summarizer import llm_generate_summary

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
	max_words: int = 500,
	llm: bool = Query(default=False),
	model: Optional[str] = Query(default="gpt-4o-mini"),
	token_limit: int = Query(default=800),
) -> Dict[str, Any]:
	content: bytes = await file.read()
	pages = extract_pages(content)
	if not pages:
		return {"summary": [], "stats": {"num_pages": 0, "num_sentences": 0, "max_words": max_words}}

	sentences = summarize_sentences(pages, max_words=max_words)
	aligned = align_summary_to_pages(sentences, pages)

	result: Dict[str, Any] = {
		"summary": aligned,
		"stats": {
			"num_pages": len(pages),
			"num_sentences": len(aligned),
			"max_words": max_words,
		},
	}
	if llm:
		try:
			coherent = llm_generate_summary(aligned, model=model or "gpt-4o-mini", token_limit=token_limit)
			result["llm_summary"] = coherent
		except Exception as e:  # return extractive even if LLM fails
			result["llm_error"] = str(e)
	return result


if __name__ == "__main__":
	uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

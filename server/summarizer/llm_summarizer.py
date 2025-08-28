from __future__ import annotations

from typing import List, Dict, Any, Optional
import logging
import re

try:
	import google.generativeai as genai
except Exception as e:  # pragma: no cover
	logging.error(f"Failed to import Google Generative AI: {e}")
	genai = None  # type: ignore

from ..config import Settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
	"You are an expert scientific writer. Write a coherent, concise 1-page summary of the research paper. "
	"Preserve factuality, avoid hallucinations, and reference page numbers inline like (p. 3) where relevant. "
	"Prioritize core ideas, contributions, methods, datasets, and key mathematical notions. "
	"Use short paragraphs with logical flow. Include page numbers for important claims and findings."
)

PAGE_REF_PATTERN = r'\(p\.\s*(\d+)\)'


def extract_page_references(text: str) -> List[Dict[str, Any]]:
	"""Extract sentences with page references from LLM summary."""
	sentences = []
	lines = text.split('\n')
	
	for line in lines:
		line = line.strip()
		if not line:
			continue
		
		# Find page references in this line
		page_refs = re.findall(PAGE_REF_PATTERN, line)
		if page_refs:
			# Use the first page reference found
			page_num = int(page_refs[0])
			sentences.append({
				"text": line,
				"page": page_num,
				"score": 1.0  # LLM-generated content gets high score
			})
		else:
			# No page reference, assign to page 1 as fallback
			sentences.append({
				"text": line,
				"page": 1,
				"score": 1.0
			})
	
	return sentences


def llm_summarize_pdf(
	pages: List[Dict[str, Any]],
	model: str = "gemini-1.5-flash",
	token_limit: int = 800,
	api_key: Optional[str] = None,
) -> Dict[str, Any]:
	"""Generate a coherent summary directly from PDF pages using Google Gemini."""
	if not pages:
		return {"summary": [], "llm_summary": ""}
	
	if genai is None:
		raise RuntimeError("google.generativeai not available")
	
	settings = Settings.load()
	key = api_key or settings.gemini_api_key
	if not key:
		raise RuntimeError("GEMINI_API_KEY is not set")

	try:
		# Configure Gemini
		genai.configure(api_key=key)
		logger.info(f"Initialized Gemini client for model: {model}")
		
		# Prepare full text with page markers
		full_text = ""
		for page in pages:
			page_num = page.get("page", 1)
			text = page.get("text", "").strip()
			if text:
				full_text += f"\n[Page {page_num}]\n{text}\n"
		
		# Truncate if too long (Gemini has higher limits, but keep reasonable)
		if len(full_text) > 30000:  # Gemini can handle much more text
			full_text = full_text[:30000] + "\n[Content truncated for brevity]"
		
		prompt = f"""Research Paper Content:

{full_text}

Task: Write a coherent summary (~1 page, <= {token_limit} words). Include page numbers like (p. N) for important claims and findings. Focus on the main contributions, methods, and key results.

{SYSTEM_PROMPT}"""
		
		logger.info(f"Sending full PDF text to Gemini (length: {len(full_text)})")
		
		# Generate content with Gemini
		model_instance = genai.GenerativeModel(model)
		response = model_instance.generate_content(prompt)
		
		llm_summary = response.text or ""
		logger.info(f"Received Gemini summary, length: {len(llm_summary)}")
		
		# Extract sentences with page references
		summary_sentences = extract_page_references(llm_summary)
		logger.info(f"Extracted {len(summary_sentences)} sentences with page references")
		
		return {
			"summary": summary_sentences,
			"llm_summary": llm_summary,
			"stats": {
				"num_pages": len(pages),
				"num_sentences": len(summary_sentences),
				"method": "gemini_llm"
			}
		}
		
	except Exception as e:
		logger.error(f"Gemini API call failed: {e}", exc_info=True)
		raise RuntimeError(f"Gemini API error: {e}")


# Keep the old function for backward compatibility
def llm_generate_summary(
	summary_sentences: List[Dict[str, Any]],
	model: str = "gemini-1.5-flash",
	token_limit: int = 800,
	api_key: Optional[str] = None,
) -> str:
	"""Legacy function - use llm_summarize_pdf instead."""
	# This is kept for backward compatibility but should not be used
	raise RuntimeError("Use llm_summarize_pdf instead of llm_generate_summary")

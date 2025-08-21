from __future__ import annotations

from typing import List, Dict, Any, Optional

try:
	from openai import OpenAI
except Exception:  # pragma: no cover
	OpenAI = None  # type: ignore

from ..config import Settings


SYSTEM_PROMPT = (
	"You are an expert scientific writer. Write a coherent, concise 1-page summary of the paper "
	"using the provided EVIDENCE sentences. Preserve factuality, avoid hallucinations, and reference page numbers inline "
	"like (p. 3) where relevant. Prioritize core ideas, contributions, methods, datasets, and key mathematical notions. "
	"Use short paragraphs with logical flow."
)


def format_evidence(summary_sentences: List[Dict[str, Any]]) -> str:
	lines = []
	for i, s in enumerate(summary_sentences, 1):
		text = s.get("text", "").strip()
		page = s.get("page", "?")
		if text:
			lines.append(f"[{i}] (p. {page}) {text}")
	return "\n".join(lines)


def llm_generate_summary(
	summary_sentences: List[Dict[str, Any]],
	model: str = "gpt-4o-mini",
	token_limit: int = 800,
	api_key: Optional[str] = None,
) -> str:
	"""Turn extractive evidence into an abstractive summary via OpenAI."""
	if not summary_sentences:
		return ""
	if OpenAI is None:
		raise RuntimeError("openai python client not available")
	settings = Settings.load()
	key = api_key or settings.openai_api_key
	if not key:
		raise RuntimeError("OPENAI_API_KEY is not set")

	client = OpenAI(api_key=key)
	messages = [
		{"role": "system", "content": SYSTEM_PROMPT},
		{
			"role": "user",
			"content": (
				"EVIDENCE (with page numbers):\n\n" + format_evidence(summary_sentences) +
				"\n\nTask: Write a coherent summary (~1 page, <= " + str(token_limit) + " tokens). "
				"Keep references like (p. N) where you used specific sentences."
			),
		},
	]
	resp = client.chat.completions.create(
		model=model,
		messages=messages,
		max_tokens=token_limit,
		temperature=0.3,
	)
	return resp.choices[0].message.content or ""

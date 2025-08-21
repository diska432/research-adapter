from __future__ import annotations

from typing import List, Dict, Any
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def align_summary_to_pages(summary: List[Dict[str, Any]], pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not summary:
		return []
	# Build a corpus per page to align by highest similarity
	page_texts = [" ".join(p.get("sentences", [])).strip() for p in pages]
	vectorizer = TfidfVectorizer(stop_words="english")
	if not any(page_texts):
		# No text; return page indices from original summary if present
		return [
			{"text": s.get("text", ""), "page": int(s.get("page", 1)), "score": float(s.get("score", 0.0))}
			for s in summary
		]
	X_pages = vectorizer.fit_transform(page_texts)

	aligned: List[Dict[str, Any]] = []
	for item in summary:
		text = item.get("text", "")
		vec = vectorizer.transform([text])
		sims = cosine_similarity(vec, X_pages)[0]
		best_page = int(np.argmax(sims)) + 1
		aligned.append({
			"text": text,
			"page": best_page,
			"score": float(item.get("score", float(np.max(sims)) ))
		})
	return aligned

from __future__ import annotations

from typing import List, Dict, Any
import fitz  # PyMuPDF
import re


_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(\\[])|")


def _split_into_sentences(text: str) -> List[str]:
	text = re.sub(r"\s+", " ", text).strip()
	if not text:
		return []
	# Simple sentence splitter; retains equations/refs reasonably.
	parts = re.split(r"(?<=[.!?])(\s+)", text)
	sentences: List[str] = []
	current = []
	for part in parts:
		if not part:
			continue
		current.append(part)
		if re.search(r"[.!?]\s*$", part):
			sent = "".join(current).strip()
			if sent:
				sentences.append(sent)
			current = []
	if current:
		sent = "".join(current).strip()
		if sent:
			sentences.append(sent)
	return sentences


def extract_pages(pdf_bytes: bytes) -> List[Dict[str, Any]]:
	"""Extract plain text per page and sentence lists.

	Returns: [{"page": idx, "text": str, "sentences": [str, ...]}]
	"""
	doc = fitz.open(stream=pdf_bytes, filetype="pdf")
	pages: List[Dict[str, Any]] = []
	for page_index in range(doc.page_count):
		page = doc.load_page(page_index)
		text = page.get_text("text")
		# Fallback: include block text if empty
		if not text.strip():
			text = page.get_text("blocks") or ""
		sentences = _split_into_sentences(text)
		pages.append({
			"page": page_index + 1,
			"text": text,
			"sentences": sentences,
		})
	doc.close()
	return pages

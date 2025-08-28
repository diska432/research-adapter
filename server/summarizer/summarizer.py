from __future__ import annotations

from typing import List, Dict, Any, Tuple
import numpy as np
import logging
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


def _collect_all_sentences(pages: List[Dict[str, Any]]) -> List[Tuple[int, str]]:
	pairs: List[Tuple[int, str]] = []
	for p in pages:
		page_num = int(p.get("page", 0))
		for s in p.get("sentences", []):
			clean = s.strip()
			if clean:
				pairs.append((page_num, clean))
	return pairs


def _textrank(sentences: List[str], damping: float = 0.85, max_iter: int = 50, tol: float = 1e-4) -> np.ndarray:
	if not sentences:
		return np.array([])
	
	logger.info(f"Running TextRank on {len(sentences)} sentences")
	
	try:
		vectorizer = TfidfVectorizer(stop_words="english")
		X = vectorizer.fit_transform(sentences)
		logger.info(f"TF-IDF matrix shape: {X.shape}")
		
		sim = cosine_similarity(X)
		logger.info(f"Similarity matrix shape: {sim.shape}")
		
		# Zero-out diag
		n = sim.shape[0]
		np.fill_diagonal(sim, 0.0)
		
		# Normalize rows
		row_sums = sim.sum(axis=1, keepdims=True) + 1e-12
		sim_norm = sim / row_sums
		
		# Power iteration
		scores = np.ones(n) / n
		for i in range(max_iter):
			new_scores = (1 - damping) / n + damping * sim_norm.T.dot(scores)
			if np.linalg.norm(new_scores - scores, ord=1) < tol:
				logger.info(f"TextRank converged after {i+1} iterations")
				break
			scores = new_scores
		
		logger.info(f"TextRank completed, score range: [{scores.min():.4f}, {scores.max():.4f}]")
		return scores
		
	except Exception as e:
		logger.error(f"TextRank failed: {e}")
		# Fallback: return uniform scores
		return np.ones(len(sentences)) / len(sentences)


def _limit_by_word_budget(selected: List[Tuple[int, str, float]], max_words: int) -> List[Tuple[int, str, float]]:
	count = 0
	out: List[Tuple[int, str, float]] = []
	for page, sent, score in selected:
		w = len(sent.split())
		if count + w > max_words:
			logger.info(f"Reached word budget {max_words}, stopping at {count} words")
			break
		out.append((page, sent, score))
		count += w
	logger.info(f"Selected {len(out)} sentences with {count} total words")
	return out


def summarize_sentences(pages: List[Dict[str, Any]], max_words: int = 500) -> List[Dict[str, Any]]:
	logger.info(f"Starting sentence summarization with max_words={max_words}")
	
	pairs = _collect_all_sentences(pages)
	logger.info(f"Collected {len(pairs)} sentence-page pairs")
	
	if not pairs:
		logger.warning("No sentences found in pages")
		return []
	
	page_numbers, sentences = zip(*pairs)
	
	try:
		scores = _textrank(list(sentences))
		if scores.size == 0:
			logger.error("TextRank returned empty scores")
			return []
		
		idx_sorted = np.argsort(-scores)
		ordered = [(page_numbers[i], sentences[i], float(scores[i])) for i in idx_sorted]
		limited = _limit_by_word_budget(ordered, max_words=max_words)
		
		# Restore original order within the chosen set to preserve readability
		chosen_set = set((p, s) for p, s, _ in limited)
		restored = [(p, s, sc) for (p, s, sc) in pairs_scored_in_doc_order(page_numbers, sentences, scores) if (p, s) in chosen_set]
		
		logger.info(f"Final summary: {len(restored)} sentences")
		return [{"page": p, "text": s, "score": sc} for p, s, sc in restored]
		
	except Exception as e:
		logger.error(f"Sentence summarization failed: {e}", exc_info=True)
		# Fallback: return first few sentences
		fallback = pairs[:min(10, len(pairs))]
		return [{"page": p, "text": s, "score": 0.5} for p, s in fallback]


def pairs_scored_in_doc_order(page_numbers, sentences, scores) -> List[Tuple[int, str, float]]:
	triples: List[Tuple[int, str, float]] = []
	for i in range(len(sentences)):
		triples.append((int(page_numbers[i]), str(sentences[i]), float(scores[i])))
	return triples

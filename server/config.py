from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

try:  # optional dependency
	from dotenv import load_dotenv  # type: ignore
	load_dotenv()
except Exception:
	pass


@dataclass
class Settings:
	gemini_api_key: Optional[str] = None

	@classmethod
	def load(cls) -> "Settings":
		return cls(
			gemini_api_key=os.getenv("GEMINI_API_KEY"),
		)

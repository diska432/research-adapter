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
	openai_api_key: Optional[str] = None

	@classmethod
	def load(cls) -> "Settings":
		return cls(
			openai_api_key=os.getenv("OPENAI_API_KEY"),
		)

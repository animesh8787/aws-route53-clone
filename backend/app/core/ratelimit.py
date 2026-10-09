"""Small in-memory sliding-window rate limiter (per process; fine for a single API instance)."""
import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.errors import AppError


class TooManyRequests(AppError):
    status_code = 429


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int, message: str):
        self.limit, self.window, self.message = limit, window_seconds, message
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            raise TooManyRequests(self.message)
        hits.append(now)

    def reset(self) -> None:
        self._hits.clear()


def client_ip(request: Request) -> str:
    """Best-effort client address: first X-Forwarded-For hop (set by the hosting proxy), else the socket peer."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


register_limiter = RateLimiter(20, 3600, "Too many sign-up attempts from this network. Try again later.")
login_limiter = RateLimiter(30, 300, "Too many sign-in attempts. Wait a few minutes and try again.")

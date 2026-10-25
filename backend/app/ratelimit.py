"""Limiteur de débit en mémoire (suffisant pour une seule instance sur Dokploy)."""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    # Derrière Cloudflare puis Traefik : on prend la vraie IP du visiteur
    for header in ("cf-connecting-ip", "x-real-ip"):
        if value := request.headers.get(header):
            return value.strip()
    if fwd := request.headers.get("x-forwarded-for"):
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "inconnu"


def limit(bucket: str, per_minute: int):
    def dependency(request: Request) -> None:
        key = f"{bucket}:{client_ip(request)}"
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= per_minute:
            raise HTTPException(429, "Trop de tentatives, réessaie dans une minute")
        q.append(now)

    return dependency


def reset() -> None:
    _hits.clear()

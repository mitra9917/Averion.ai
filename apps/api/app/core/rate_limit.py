"""Bounded per-process limits for provider-backed requests."""

import time
from collections import OrderedDict, deque
from threading import Lock

from fastapi import HTTPException

_lock = Lock()
_requests: OrderedDict[str, deque[float]] = OrderedDict()


def limit_transcription(principal: str) -> None:
    now = time.monotonic()
    with _lock:
        timestamps = _requests.setdefault(principal, deque())
        while timestamps and timestamps[0] <= now - 60:
            timestamps.popleft()
        if len(timestamps) >= 5:
            raise HTTPException(429, "Too many voice requests. Please try again in a minute.",
                                headers={"Retry-After": "60"})
        timestamps.append(now)
        _requests.move_to_end(principal)
        while len(_requests) > 4096:
            _requests.popitem(last=False)

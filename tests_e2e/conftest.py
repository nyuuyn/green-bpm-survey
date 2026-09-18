"""Spins up the site's own static file server for the Playwright suite.

Mirrors README.md's "npm run serve" (python -m http.server) rather than opening
index.html via file:// - app.js's fetch("data.json")/fetch("analysis.json") calls
require http, same reason the repo doesn't support file:// today.

Overrides pytest-playwright's `base_url` fixture, which is its supported extension
point for exactly this - once set, `page.goto("/index.html")` in tests resolves
against it automatically via the browser context.
"""
import functools
import http.server
import pathlib
import socket
import threading

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def base_url():
    port = _free_port()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(REPO_ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)


@pytest.fixture
def browser_context_args(browser_context_args):
    # Deterministic viewport so chart layout (grid column count) doesn't vary by runner.
    return {**browser_context_args, "viewport": {"width": 1280, "height": 900}}

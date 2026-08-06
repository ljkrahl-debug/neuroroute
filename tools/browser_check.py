#!/usr/bin/env python3
"""Load every page in a real browser and report JS errors, failed requests and
missing interactive behaviour.

    python3 tools/browser_check.py                 # all pages
    python3 tools/browser_check.py --shots out/    # also write screenshots

Needs playwright (`pip install playwright`). The browser binary is the one
already present in this environment; no download happens.
"""

from __future__ import annotations

import argparse
import http.server
import functools
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "website"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

IGNORE_URL_FRAGMENTS = (
    "fonts.googleapis.com",
    "fonts.gstatic.com",
)

# Report only overflow a visitor can actually see. The decorative hero orbs are
# far wider than the viewport by design but sit inside an overflow:hidden
# ancestor, so they inflate scrollWidth without ever showing a scrollbar.
# A fixed-position element (the nav) is not clipped by body's overflow-x, so
# that one does reach the user — which is exactly what this needs to catch.
OVERFLOW_JS = """() => {
  const vw = document.documentElement.clientWidth;
  const hits = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || (r.right <= vw + 2 && r.left >= -2)) return;
    let clipped = false;
    for (let n = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX === 'hidden' || s.overflowX === 'clip') { clipped = true; break; }
      if (s.position === 'fixed') break;
    }
    if (clipped) return;
    const name = el.tagName.toLowerCase() +
      (el.getAttribute('class') ? '.' + el.getAttribute('class').split(/\\s+/)[0] : '');
    hits.push(name + ' (' + Math.round(r.right - vw) + 'px past the right edge)');
  });
  return [...new Set(hits)].slice(0, 4);
}"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # keep the request log out of results
        pass


def serve(directory: Path) -> tuple[str, socketserver.TCPServer]:
    handler = functools.partial(QuietHandler, directory=str(directory))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}", httpd


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", help="directory to write screenshots into")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    base, httpd = serve(SITE)
    shots = Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)

    pages = sorted(p.name for p in SITE.glob("*.html"))
    failures: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})

        # Google Fonts is blocked in some sandboxes and then stalls every load
        # for ~13s. Skip it: the fallback faces are wider than Bebas/Outfit, so
        # layout checks stay on the pessimistic side.
        ctx.route("**://fonts.googleapis.com/**", lambda r: r.abort())
        ctx.route("**://fonts.gstatic.com/**", lambda r: r.abort())

        for name in pages:
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(f"JS error: {e}"))
            def on_console(m):
                if m.type != "error":
                    return
                # Google Fonts is blocked in some sandboxes; that is an
                # environment problem, not a problem with the page.
                url = (m.location or {}).get("url", "") or m.text
                if any(f in url for f in IGNORE_URL_FRAGMENTS):
                    return
                errors.append(f"console.error: {m.text}")

            page.on("console", on_console)
            page.on(
                "requestfailed",
                lambda r: errors.append(f"request failed: {r.url}")
                if not any(f in r.url for f in IGNORE_URL_FRAGMENTS)
                else None,
            )

            page.goto(f"{base}/{name}", wait_until="load")
            page.wait_for_timeout(450)

            # language toggle must actually flip the document
            if page.locator(".lang-btn[data-set='de']").count():
                page.click(".lang-btn[data-set='de']")
                page.wait_for_timeout(150)
                if not page.evaluate("document.body.classList.contains('lang-de')"):
                    errors.append("language toggle did not switch to DE")
                if page.evaluate("document.documentElement.lang") != "de":
                    errors.append("html lang not updated on DE switch")
                page.click(".lang-btn[data-set='en']")
                page.wait_for_timeout(150)

            for note in page.evaluate(OVERFLOW_JS):
                errors.append("overflows viewport: " + note)

            if shots:
                page.screenshot(path=str(shots / f"{name}.png"))

            status = "ok" if not errors else "FAIL"
            print(f"  {status:<4} {name}")
            for e in dict.fromkeys(errors):
                print(f"         {e}")
                failures.append(f"{name}: {e}")
            page.close()

        # narrow-viewport pass: phone, and the tablet/small-laptop range where
        # the nav used to push its CTA off screen
        mob = ctx.new_page()
        for width in (390, 1024):
            mob.set_viewport_size({"width": width, "height": 844})
            for name in ("index.html", "contact.html", "pricing.html"):
                mob.goto(f"{base}/{name}", wait_until="load")
                mob.wait_for_timeout(300)
                hits = mob.evaluate(OVERFLOW_JS)
                if hits:
                    for h in hits:
                        failures.append(f"{name} @{width}px: {h}")
                        print(f"  FAIL {name} @{width}px: {h}")
                else:
                    print(f"  ok   {name} @{width}px")
                if shots and width == 390:
                    mob.screenshot(path=str(shots / f"mobile-{name}.png"))
        mob.close()

        browser.close()

    httpd.shutdown()
    print()
    print(f"{len(pages)} pages · {len(failures)} problem(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

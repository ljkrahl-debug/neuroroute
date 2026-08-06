#!/usr/bin/env python3
"""Pre-launch gate for the Neuroroute website.

Run this before every deploy:

    python3 tools/prelaunch_check.py

Errors block a launch, warnings do not. The most important check is the legal
one: impressum.html and datenschutz.html still ship with placeholders like
[Straße und Hausnummer]. Going live with those in Germany is an actual legal
problem (§ 5 DDG), so the check fails loudly until they are filled in and a
lawyer has signed the texts off.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "website"

errors: list[str] = []
warnings: list[str] = []


def error(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def check_legal_placeholders(pages: dict[Path, str]) -> None:
    for path, text in pages.items():
        found = re.findall(r'<span class="placeholder">\s*(\[[^\]]*\])', text)
        if found:
            error(
                f"{path.name}: {len(found)} unfilled placeholder(s) — "
                + ", ".join(sorted(set(found))[:4])
                + (" …" if len(set(found)) > 4 else "")
            )


def check_internal_links(pages: dict[Path, str]) -> None:
    for path, text in pages.items():
        for href in re.findall(r'href="([^"]+)"', text):
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:")):
                continue
            target = unquote(href.split("#")[0].split("?")[0])
            if not target:
                continue
            resolved = (SITE / target.lstrip("/")) if target.startswith("/") else (path.parent / target)
            if not resolved.exists():
                error(f"{path.name}: broken link -> {href}")


def check_assets(pages: dict[Path, str]) -> None:
    required = [
        "assets/favicon.svg",
        "assets/apple-touch-icon.png",
        "assets/og-image.png",
        "assets/icon-192.png",
        "assets/icon-512.png",
        "favicon.ico",
        "site.webmanifest",
        "robots.txt",
        "sitemap.xml",
        "404.html",
    ]
    for rel in required:
        if not (SITE / rel).exists():
            error(f"missing required file: website/{rel}")


def check_meta(pages: dict[Path, str]) -> None:
    for path, text in pages.items():
        if '<meta name="description"' not in text:
            error(f"{path.name}: no meta description")
        if '<link rel="canonical"' not in text:
            error(f"{path.name}: no canonical URL")
        if 'property="og:image"' not in text:
            error(f"{path.name}: no og:image")
        m = re.search(r'<meta name="description" content="([^"]*)"', text)
        if m and len(m.group(1)) > 165:
            warn(f"{path.name}: meta description is {len(m.group(1))} chars (search results cut ~160)")


def check_sitemap(pages: dict[Path, str]) -> None:
    sitemap = SITE / "sitemap.xml"
    if not sitemap.exists():
        return
    listed = set(re.findall(r"<loc>[^<]*/([^/<]*)</loc>", sitemap.read_text(encoding="utf-8")))
    for path, text in pages.items():
        indexable = "noindex" not in text
        in_map = path.name in listed or (path.name == "index.html" and "" in listed)
        if indexable and not in_map:
            warn(f"{path.name}: indexable but not in sitemap.xml")
        if not indexable and path.name in listed:
            error(f"{path.name}: noindex but listed in sitemap.xml")


def check_prototype_notice(pages: dict[Path, str]) -> None:
    app = SITE / "app.html"
    if app.exists() and "noindex" not in app.read_text(encoding="utf-8"):
        error("app.html: the prototype simulation must stay noindex")


def main() -> int:
    pages = {p: p.read_text(encoding="utf-8") for p in sorted(SITE.glob("*.html"))}
    if not pages:
        print("no pages found in website/", file=sys.stderr)
        return 2

    check_legal_placeholders(pages)
    check_internal_links(pages)
    check_assets(pages)
    check_meta(pages)
    check_sitemap(pages)
    check_prototype_notice(pages)

    for w in warnings:
        print(f"  warn   {w}")
    for e in errors:
        print(f"  ERROR  {e}")

    print()
    print(f"{len(pages)} pages checked · {len(errors)} error(s) · {len(warnings)} warning(s)")
    if errors:
        print("\nNOT ready to launch.")
        return 1
    print("\nReady to launch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

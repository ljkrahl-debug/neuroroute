#!/usr/bin/env python3
"""Apply site-wide head metadata, accessibility and housekeeping fixes.

The pages in website/ each carry their own inlined copy of the shared CSS/JS
(see CLAUDE.md — that is deliberate, so nothing can go missing when hosting).
That makes hand-editing 19 near-identical <head> blocks error prone, so this
script owns those cross-cutting bits instead.

It is idempotent: everything it injects is wrapped in nr:* markers or guarded
by a presence check, so it can be re-run after content edits.

    python3 tools/finalize_site.py            # apply
    python3 tools/finalize_site.py --check    # report drift, change nothing
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "website"
BASE_URL = "https://neuroroute.ai"

# Per-page description + canonical slug. Descriptions are English because the
# pages render in English by default (see setLang: localStorage fallback 'en').
PAGES: dict[str, dict[str, str]] = {
    "index.html": {
        "slug": "",
        "desc": "The operating system for multimodal logistics: plan road, rail, sea and air "
                "transports, use your own partner network first, turn empty runs into revenue.",
    },
    "platform.html": {
        "slug": "platform.html",
        "desc": "One platform for requests, offers, capacity and tracking across road, rail, sea "
                "and air — built for forwarders and shippers.",
    },
    "marketplace.html": {
        "slug": "marketplace.html",
        "desc": "The Empty Capacity Marketplace: publish free capacity and empty runs in one click, "
                "and book discounted space from other companies.",
    },
    "profile.html": {
        "slug": "profile.html",
        "desc": "Every company on Neuroroute gets a public profile with services, transport modes, "
                "fleet and verified credentials.",
    },
    "solutions.html": {
        "slug": "solutions.html",
        "desc": "Solutions for shippers, forwarders, multimodal operators and terminals — from the "
                "first request to final delivery.",
    },
    "pricing.html": {
        "slug": "pricing.html",
        "desc": "Transparent pricing for Neuroroute — three packages for forwarders and shippers, "
                "with commission only on brokered transports.",
    },
    "network.html": {
        "slug": "network.html",
        "desc": "The hybrid model: your own partner network first, the open network second. Keep your "
                "business relationships and still reach new capacity.",
    },
    "tracking.html": {
        "slug": "tracking.html",
        "desc": "Status-based shipment tracking across all transport modes — no GPS hardware required. "
                "Everyone involved sees the same progress.",
    },
    "about.html": {
        "slug": "about.html",
        "desc": "Who we are and why we are building Neuroroute — a neutral marketplace for multimodal "
                "logistics.",
    },
    "contact.html": {
        "slug": "contact.html",
        "desc": "Request a demo, ask a question or explore a partnership. We reply within one business day.",
    },
    "faq.html": {
        "slug": "faq.html",
        "desc": "Answers to the most common questions about Neuroroute — pricing, data protection, "
                "onboarding, transport modes and the marketplace.",
    },
    "usecases.html": {
        "slug": "usecases.html",
        "desc": "Real-world scenarios: empty return runs, multimodal chains, peak capacity and "
                "partner-first sourcing.",
    },
    "roadmap.html": {
        "slug": "roadmap.html",
        "desc": "What we are building next — from the MVP core flow to matching, marketplace, tracking "
                "and billing.",
    },
    "news.html": {
        "slug": "news.html",
        "desc": "News, product updates and announcements from the Neuroroute team.",
    },
    "impressum.html": {
        "slug": "impressum.html",
        "desc": "Impressum and legal notice for Neuroroute.",
    },
    "datenschutz.html": {
        "slug": "datenschutz.html",
        "desc": "Privacy policy — how Neuroroute processes personal data under the GDPR.",
    },
    "agb.html": {
        "slug": "agb.html",
        "desc": "General terms and conditions for the use of the Neuroroute platform.",
    },
    "login.html": {
        "slug": "login.html",
        "desc": "Sign in to Neuroroute.",
        "robots": "noindex, follow",
    },
    "app.html": {
        "slug": "app.html",
        "desc": "The Neuroroute application.",
        "robots": "noindex, nofollow",
    },
    "404.html": {
        "slug": "404.html",
        "desc": "This page could not be found.",
        "robots": "noindex, follow",
    },
}

META_START = "<!-- nr:meta:start -->"
META_END = "<!-- nr:meta:end -->"
A11Y_START = "<!-- nr:a11y:start -->"
A11Y_END = "<!-- nr:a11y:end -->"

ORG_JSONLD = """<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Neuroroute",
  "url": "%(base)s/",
  "logo": "%(base)s/assets/icon-512.png",
  "description": "Multimodal logistics platform connecting shippers, forwarders and drivers across road, rail, sea and air.",
  "sameAs": [],
  "contactPoint": [{
    "@type": "ContactPoint",
    "email": "hello@neuroroute.ai",
    "contactType": "sales",
    "availableLanguage": ["en", "de"]
  }]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Neuroroute",
  "url": "%(base)s/",
  "inLanguage": ["en", "de"]
}
</script>""" % {"base": BASE_URL}


def meta_block(filename: str, title: str, cfg: dict[str, str]) -> str:
    canonical = f"{BASE_URL}/{cfg['slug']}" if cfg["slug"] else f"{BASE_URL}/"
    desc = " ".join(cfg["desc"].split())
    robots = cfg.get("robots", "index, follow")
    lines = [
        META_START,
        '<meta name="description" content="%s">' % desc,
        '<meta name="robots" content="%s">' % robots,
        '<link rel="canonical" href="%s">' % canonical,
        '<meta name="theme-color" content="#03050a">',
        '<meta name="color-scheme" content="dark">',
        "",
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Neuroroute">',
        '<meta property="og:title" content="%s">' % title,
        '<meta property="og:description" content="%s">' % desc,
        '<meta property="og:url" content="%s">' % canonical,
        '<meta property="og:image" content="%s/assets/og-image.png">' % BASE_URL,
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="Neuroroute — Plan. Connect. Move the World.">',
        '<meta property="og:locale" content="en_US">',
        '<meta property="og:locale:alternate" content="de_DE">',
        "",
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="%s">' % title,
        '<meta name="twitter:description" content="%s">' % desc,
        '<meta name="twitter:image" content="%s/assets/og-image.png">' % BASE_URL,
        "",
        '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">',
        '<link rel="alternate icon" href="/favicon.ico" sizes="any">',
        '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">',
        '<link rel="manifest" href="/site.webmanifest">',
        "",
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    ]
    if filename == "index.html":
        lines += ["", ORG_JSONLD]
    lines.append(META_END)
    return "\n".join(lines)


CSS_START = "<!-- nr:css:start -->"
CSS_END = "<!-- nr:css:end -->"

SITE_CSS = """<style>
/* nr:a11y — keyboard and screen-reader affordances */
.skip-link {
  position: absolute; left: 8px; top: -60px; z-index: 999;
  background: var(--cyan); color: #03050a; font-weight: 700;
  padding: 10px 18px; border-radius: 0 0 8px 8px; text-decoration: none;
  transition: top 0.18s ease;
}
.skip-link:focus { top: 0; }
:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; border-radius: 3px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* nr:stacking — a rule late in the FX block,
     nav, section, footer, .modal-bg { position: relative; z-index: 1; }
   overrides the nav's own position:fixed/z-index:200 and the prototype
   modal's position:fixed/z-index:300. Consequences: the nav scrolled away
   instead of sticking, the open burger menu rendered *under* the hero
   (unreadable on phones), and app.html's dialogs stopped being overlays.
   The rule exists to lift content above the particle canvas at z-index 0,
   which only section and footer need. Restore the two it broke. */
nav { position: fixed; z-index: 200; }
.modal-bg { position: fixed; z-index: 300; }

/* nr:nav — two viewport ranges where the top bar did not fit.

   981-1180px (iPad landscape, small laptops): the original stylesheet only
   collapsed the link row below 980px, so the full row plus language switch
   plus CTA — about 1200px of content — pushed the CTA off the right edge.
   nav is position:fixed, so body's overflow-x:hidden does not clip it and
   the button was really unreachable. Collapse earlier.

   Below 640px: even collapsed, logo + language switch + CTA + burger need
   roughly 500px and overflowed a 390px phone by ~150px. Move the CTA into
   the burger menu rather than drop it — it is the primary conversion. */
@media (max-width: 1180px) {
  .nav-links {
    display: none; position: absolute; top: 68px; left: 0; right: 0;
    flex-direction: column; padding: 24px;
    gap: 20px; border-bottom: 1px solid var(--border);
    /* opaque, not the original 97%: the 3% that showed through rendered the
       hero headline as ghost text behind the links. On this near-black theme
       the two are visually indistinguishable, minus the legibility problem. */
    background: #05080f;
    box-shadow: 0 20px 44px rgba(0,0,0,0.55);
  }
  .nav-links.open { display: flex; }
  .nav-burger { display: flex; }
}
.nav-links .nav-cta-mobile { display: none; }
.nav-links .nav-cta-mobile a {
  display: block; text-align: center; background: var(--cyan); color: #000;
  font-weight: 700; padding: 12px 18px; border-radius: 4px;
}
@media (max-width: 640px) {
  nav { padding: 0 16px; }
  .logo { font-size: 1.3rem; }
  .nav-right { gap: 10px; }
  .lang-btn { padding: 6px 9px; font-size: 0.72rem; }
  .nav-right .nav-cta { display: none; }
  .nav-links .nav-cta-mobile { display: block; }
}
</style>"""


def apply_meta(text: str, filename: str) -> str:
    cfg = PAGES.get(filename)
    if not cfg:
        return text
    m = re.search(r"<title>(.*?)</title>", text, re.S)
    if not m:
        return text
    title = " ".join(m.group(1).split()).replace('"', "&quot;")
    block = meta_block(filename, title, cfg)

    existing = re.search(re.escape(META_START) + r".*?" + re.escape(META_END), text, re.S)
    if existing:
        return text[: existing.start()] + block + text[existing.end():]
    return text[: m.end()] + "\n" + block + text[m.end():]


def apply_a11y(text: str, filename: str) -> str:
    # 1. decorative icons are hidden from assistive tech
    text = re.sub(
        r"<svg (?![^>]*aria-hidden)",
        '<svg aria-hidden="true" focusable="false" ',
        text,
    )

    # 2. nav controls get accessible names
    text = text.replace(
        '<button class="nav-burger">',
        '<button class="nav-burger" type="button" aria-label="Menu" '
        'aria-expanded="false" aria-controls="nav-links">',
    )
    text = text.replace(
        '<ul class="nav-links">', '<ul class="nav-links" id="nav-links">'
    )
    text = text.replace(
        '<div class="lang-switch">',
        '<div class="lang-switch" role="group" aria-label="Language / Sprache">',
    )
    text = text.replace(
        '<button class="lang-btn active" data-set="en">EN</button>',
        '<button class="lang-btn active" type="button" data-set="en" '
        'aria-label="Switch to English" aria-pressed="true">EN</button>',
    )
    text = text.replace(
        '<button class="lang-btn" data-set="de">DE</button>',
        '<button class="lang-btn" type="button" data-set="de" '
        'aria-label="Auf Deutsch umschalten" aria-pressed="false">DE</button>',
    )

    # 3. setLang keeps aria-pressed in sync with the visual active state
    text = text.replace(
        "    b.classList.toggle('active', b.dataset.set === lang);",
        "    var on = b.dataset.set === lang;\n"
        "    b.classList.toggle('active', on);\n"
        "    b.setAttribute('aria-pressed', on ? 'true' : 'false');",
    )

    # 4. burger reports its expanded state
    text = text.replace(
        "      burger.addEventListener('click', () => links.classList.toggle('open'));",
        "      burger.addEventListener('click', () => {\n"
        "        const open = links.classList.toggle('open');\n"
        "        burger.setAttribute('aria-expanded', open ? 'true' : 'false');\n"
        "      });",
    )
    text = text.replace(
        "      links.querySelectorAll('a').forEach(a => a.addEventListener('click', "
        "() => links.classList.remove('open')));",
        "      links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {\n"
        "        links.classList.remove('open');\n"
        "        burger.setAttribute('aria-expanded', 'false');\n"
        "      }));",
    )

    # 5. skip link + main landmark (marketing pages only — the prototype has its
    #    own shell with neither nav nor footer)
    if A11Y_START not in text and "</nav>" in text and "<footer>" in text:
        body_open = re.search(r"<body[^>]*>", text)
        if body_open:
            skip = (
                A11Y_START
                + '\n<a class="skip-link" href="#main">'
                '<span data-lang="en">Skip to content</span>'
                '<span data-lang="de">Zum Inhalt springen</span></a>\n'
                + A11Y_END
            )
            text = text[: body_open.end()] + "\n" + skip + text[body_open.end():]
        text = text.replace("</nav>", '</nav>\n\n<main id="main">', 1)
        text = text.replace("<footer>", "</main>\n\n<footer>", 1)

    # 6. the CTA needs a home in the burger menu once it leaves the bar
    if "nav-cta-mobile" not in text and '<ul class="nav-links"' in text:
        text = text.replace(
            "  </ul>\n  <div class=\"nav-right\">",
            '    <li class="nav-cta-mobile"><a href="contact.html">'
            '<span data-lang="en">Request Demo</span>'
            '<span data-lang="de">Demo anfragen</span></a></li>\n'
            "  </ul>\n  <div class=\"nav-right\">",
            1,
        )

    # 7. the injected stylesheet, once, right before </head>
    old = re.search(r"<style>\s*/\* nr:a11y.*?</style>\n?", text, re.S)
    if old:
        text = text[: old.start()] + text[old.end():]
    marked = re.search(re.escape(CSS_START) + r".*?" + re.escape(CSS_END) + r"\n?", text, re.S)
    if marked:
        text = text[: marked.start()] + text[marked.end():]
    text = text.replace("</head>", CSS_START + "\n" + SITE_CSS + "\n" + CSS_END + "\n</head>", 1)

    return text


def apply_fixes(text: str, filename: str) -> str:
    # html lang: the script sets the real value on load from localStorage; the
    # static default must match its 'en' fallback so the first paint agrees.
    text = re.sub(r"<html lang=\"[^\"]*\">", '<html lang="en">', text, count=1)

    # Copyright year maintains itself instead of going stale every January.
    text = re.sub(
        r"©\s*20\d\d(?=\s*Neuroroute)",
        '© <span class="js-year">2026</span>',
        text,
    )
    if 'class="js-year"' in text and "nr:year" not in text:
        text = text.replace(
            "</body>",
            '<script>/* nr:year */document.querySelectorAll(".js-year")'
            '.forEach(function(e){e.textContent=new Date().getFullYear();});</script>\n</body>',
            1,
        )
    return text


def build_sitemap() -> str:
    urls = []
    for name, cfg in PAGES.items():
        if "noindex" in cfg.get("robots", ""):
            continue
        loc = f"{BASE_URL}/{cfg['slug']}" if cfg["slug"] else f"{BASE_URL}/"
        priority = "1.0" if name == "index.html" else "0.7"
        urls.append(
            "  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <priority>{priority}</priority>\n"
            "  </url>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )


def build_robots() -> str:
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "\n"
        "# The clickable prototype is a browser simulation, not public content.\n"
        "Disallow: /app.html\n"
        "Disallow: /login.html\n"
        "\n"
        f"Sitemap: {BASE_URL}/sitemap.xml\n"
    )


def process(path: Path) -> tuple[str, str]:
    original = path.read_text(encoding="utf-8")
    text = apply_meta(original, path.name)
    text = apply_a11y(text, path.name)
    text = apply_fixes(text, path.name)
    return original, text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift without writing")
    args = ap.parse_args()

    changed: list[str] = []
    for path in sorted(SITE.glob("*.html")):
        original, text = process(path)
        if text != original:
            changed.append(path.name)
            if not args.check:
                path.write_text(text, encoding="utf-8")

    for name, content in (("sitemap.xml", build_sitemap()), ("robots.txt", build_robots())):
        target = SITE / name
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            changed.append(name)
            if not args.check:
                target.write_text(content, encoding="utf-8")

    if args.check:
        if changed:
            print("out of date: " + ", ".join(changed))
            return 1
        print("all pages up to date")
        return 0

    print(f"updated {len(changed)} page(s): {', '.join(changed) if changed else '—'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

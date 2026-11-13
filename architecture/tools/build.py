"""Checks the architecture data and regenerates the static HTML built from it.

Run from anywhere (Python 3 standard library only):

    python3 architecture/tools/build.py

It does three things:
  1. Verifies architecture/architecture.json: every code excerpt must appear
     verbatim in its file, every edge and build-log reference must exist, and
     every local link must point at a real page.
  2. Writes the text version of the architecture into architecture/index.html
     (between the TEXT-VERSION markers), for screen readers and visitors
     without JavaScript.
  3. Writes the build log timeline into architecture/build-log/index.html
     (between the BUILD-LOG markers) from architecture/build-log/build-log.json.

Nothing here runs on deploy: GitHub Pages serves the committed files as they
are, so run this and commit the result after editing either JSON file.
"""
import html
import json
import os
import re
import sys
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARCH_JSON = os.path.join(ROOT, "architecture", "architecture.json")
LOG_JSON = os.path.join(ROOT, "architecture", "build-log", "build-log.json")
ARCH_HTML = os.path.join(ROOT, "architecture", "index.html")
LOG_HTML = os.path.join(ROOT, "architecture", "build-log", "index.html")

KIND_LABELS = {
    "client": "Browser",
    "host": "Hosting",
    "page": "Page",
    "link": "Links",
    "module": "Module",
    "data": "Data",
    "external": "External service",
}

e = html.escape


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def fail(problems):
    print("Problems found:")
    for p in problems:
        print("  -", p)
    sys.exit(1)


# ---------------------------------------------------------------- checks

def check(arch, log):
    problems = []
    ids = [n["id"] for n in arch["nodes"]]
    log_ids = {x["id"] for x in log["entries"]}
    if len(ids) != len(set(ids)):
        problems.append("duplicate node ids")

    for n in arch["nodes"]:
        for i, c in enumerate(n.get("code", [])):
            path = os.path.join(ROOT, c["file"])
            if not os.path.exists(path):
                problems.append(f"{n['id']}: code file {c['file']} doesn't exist")
                continue
            with open(path, encoding="utf-8") as f:
                if c["snippet"] not in f.read():
                    problems.append(f"{n['id']}: excerpt {i + 1} no longer matches {c['file']}")
        for ref in n.get("buildLog", []):
            if ref not in log_ids:
                problems.append(f"{n['id']}: build log entry '{ref}' doesn't exist")
        link = n.get("link")
        if link and not link["href"].startswith("http"):
            target = os.path.normpath(os.path.join(ROOT, "architecture", link["href"].split("#")[0]))
            if not os.path.exists(os.path.join(target, "index.html")) and not os.path.isfile(target):
                problems.append(f"{n['id']}: link {link['href']} doesn't point at a page")

    for edge in arch["edges"]:
        for end in ("from", "to"):
            if edge[end] not in ids:
                problems.append(f"edge {edge['from']} -> {edge['to']}: unknown node '{edge[end]}'")

    for entry in log["entries"]:
        for comp in entry.get("components", []):
            if comp not in ids:
                problems.append(f"build log '{entry['id']}': unknown component '{comp}'")
        if not re.fullmatch(r"[0-9a-f]{7,40}", entry["shipped"]["commit"]):
            problems.append(f"build log '{entry['id']}': commit should be a hash")
    return problems


# ---------------------------------------------------------------- helpers

def replace_between(path, marker, content):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    start, end = f"<!-- {marker}:START -->", f"<!-- {marker}:END -->"
    if start not in text or end not in text:
        fail([f"{os.path.relpath(path, ROOT)} is missing the {marker} markers"])
    before = text.split(start)[0]
    after = text.split(end)[1]
    new = before + start + "\n" + content + "\n" + " " * 12 + end + after
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)


def file_url(arch, path):
    return f"{arch['repo']}/blob/{arch['branch']}/{path}"


def fmt_live(value):
    if not value:
        return None
    dt = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    return dt.strftime("%Y-%m-%d %H:%M UTC")


# ---------------------------------------------------------------- text version

def render_text_version(arch, log):
    titles = {x["id"]: x["title"] for x in log["entries"]}
    labels = {n["id"]: n["label"] for n in arch["nodes"]}
    out = []
    out.append('<p>The same content as the diagram, as plain text. Components are listed from the visitor\'s browser down to the check logic.</p>')
    out.append('<h3>Connections</h3>\n<ul class="tv-edges">')
    for edge in arch["edges"]:
        arrow = "↔" if edge.get("both") else "→"
        out.append(f'    <li><strong>{e(labels[edge["from"]])} {arrow} {e(labels[edge["to"]])}</strong> ({e(edge["label"])}): {e(edge["detail"])}</li>')
    out.append("</ul>")
    for n in arch["nodes"]:
        out.append(f'<article class="tv-node" id="tv-{n["id"]}" aria-labelledby="tv-{n["id"]}-h">')
        out.append(f'    <h3 id="tv-{n["id"]}-h">{e(n["label"])} <span class="tv-kind">{e(KIND_LABELS.get(n["kind"], n["kind"]))}</span></h3>')
        out.append(f'    <p>{e(n["summary"])}</p>')
        out.append(f'    <h4>What it does</h4>\n    <p>{e(n["does"])}</p>')
        for c in n.get("code", []):
            out.append(f'    <figure class="tv-code"><figcaption><a href="{e(file_url(arch, c["file"]))}">{e(c["file"])}</a></figcaption>'
                       f'<pre><code>{e(c["snippet"])}</code></pre></figure>')
        out.append(f'    <h4>Design decision</h4>\n    <p>{e(n["decision"])}</p>')
        if n.get("tradeoffs"):
            out.append("    <h4>Tradeoffs</h4>\n    <ul>")
            out.extend(f"        <li>{e(t)}</li>" for t in n["tradeoffs"])
            out.append("    </ul>")
        if n.get("todo"):
            out.append(f'    <p class="todo"><strong>TODO:</strong> {e(n["todo"])}</p>')
        if n.get("link"):
            out.append(f'    <p><a href="{e(n["link"]["href"])}">{e(n["link"]["label"])}</a></p>')
        if n.get("buildLog"):
            links = ", ".join(f'<a href="build-log/#{e(r)}">{e(titles[r])}</a>' for r in n["buildLog"])
            out.append(f"    <p>From the build log: {links}</p>")
        out.append("</article>")
    # Not re-indented: whitespace inside <pre> is significant.
    return "\n".join(out)


# ---------------------------------------------------------------- build log

def render_build_log(arch, log):
    labels = {n["id"]: n["label"] for n in arch["nodes"]}
    out = ['<ol class="timeline">']
    for entry in log["entries"]:
        sh = entry["shipped"]
        commit_url = f'{log["repo"]}/commit/{sh["commit"]}'
        live = fmt_live(sh.get("live"))
        out.append(f'    <li class="entry" id="{e(entry["id"])}">')
        out.append(f'        <article aria-labelledby="{e(entry["id"])}-h">')
        out.append(f'            <p class="entry-date"><time datetime="{e(entry["date"])}">{e(entry["date"])}</time></p>')
        out.append(f'            <h2 id="{e(entry["id"])}-h">{e(entry["title"])}</h2>')
        out.append(f'            <h3>What I tried, and why</h3>\n            <p>{e(entry["tried"])}</p>')
        if entry.get("broke"):
            out.append(f'            <h3>What broke</h3>\n            <p class="broke">{e(entry["broke"])}</p>')
        if entry.get("fixed"):
            out.append(f'            <h3>How I fixed it</h3>\n            <p>{e(entry["fixed"])}</p>')
        if not entry.get("broke"):
            out.append('            <p class="smooth">This step went smoothly.</p>')
        if entry.get("note"):
            out.append(f'            <p class="note">{e(entry["note"])}</p>')
        live_html = f'went live <time datetime="{e(sh["live"])}">{e(live)}</time>' if live else "not live yet"
        out.append(f'            <p class="shipped"><span class="shipped-label">Shipped</span> '
                   f'<a href="{e(commit_url)}"><code>{e(sh["commit"])}</code></a>, {live_html}</p>')
        comps = entry.get("components", [])
        if comps:
            links = " ".join(f'<a class="chip" href="../#{e(c)}">{e(labels[c])}</a>' for c in comps)
            out.append(f'            <p class="components"><span class="sr-only">Related components: </span>{links}</p>')
        out.append("        </article>\n    </li>")
    out.append("</ol>")
    # Not re-indented: whitespace inside <pre> is significant.
    return "\n".join(out)


def main():
    arch, log = load(ARCH_JSON), load(LOG_JSON)
    problems = check(arch, log)
    if problems:
        fail(problems)
    replace_between(ARCH_HTML, "TEXT-VERSION", render_text_version(arch, log))
    replace_between(LOG_HTML, "BUILD-LOG", render_build_log(arch, log))
    n_code = sum(len(n.get("code", [])) for n in arch["nodes"])
    print(f"OK: {len(arch['nodes'])} components, {len(arch['edges'])} connections, "
          f"{n_code} code excerpts verified, {len(log['entries'])} build log entries.")


if __name__ == "__main__":
    main()

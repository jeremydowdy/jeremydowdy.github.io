// Interactive architecture diagram. All content comes from architecture.json
// (and build-log titles from build-log/build-log.json); this file only
// handles layout, rendering and interaction. No libraries.
(function () {
    "use strict";

    // ---- Layout constants (the grid positions themselves live in the JSON) ----
    var COL_W = 270, ROW_H = 140, NODE_W = 170, NODE_H = 72, PAD = 30;
    var ZOOM_WIDTH = NODE_W * 3.4;        // width of the view when zoomed on a node
    var ANIM_MS = 450;                    // zoom transition
    var FLOW_MS = 1800, FLOW_RUNS = 3;    // data-flow animation: duration and repeats
    var NARROW = window.matchMedia("(max-width: 760px)");
    var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
    var SVG_NS = "http://www.w3.org/2000/svg";

    var $ = function (id) { return document.getElementById(id); };
    var svg = $("diagram");

    var data = null, logTitles = {}, nodesById = {}, nodeEls = {}, edgeEls = [], listItems = {};
    var fullView = null, currentView = null, selectedId = null, zoomFrame = null;

    // ------------------------------------------------------------ helpers

    function el(name, attrs, parent) {
        var node = document.createElementNS(SVG_NS, name);
        Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        if (parent) parent.appendChild(node);
        return node;
    }

    function h(tag, attrs, text) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        if (text != null) node.textContent = text;
        return node;
    }

    function center(n) {
        return { x: PAD + n.pos[0] * COL_W + NODE_W / 2, y: PAD + n.pos[1] * ROW_H + NODE_H / 2 };
    }

    // Point where the line from the box center toward (tx, ty) leaves the box.
    function boxEdgePoint(c, tx, ty, gap) {
        var dx = tx - c.x, dy = ty - c.y;
        var sx = dx === 0 ? Infinity : (NODE_W / 2 + gap) / Math.abs(dx);
        var sy = dy === 0 ? Infinity : (NODE_H / 2 + gap) / Math.abs(dy);
        var s = Math.min(sx, sy);
        return { x: c.x + dx * s, y: c.y + dy * s };
    }

    function wrapText(text, maxChars) {
        var words = text.split(" "), lines = [], line = "";
        words.forEach(function (w) {
            if ((line + " " + w).trim().length > maxChars && line) { lines.push(line); line = w; }
            else line = (line + " " + w).trim();
        });
        if (line) lines.push(line);
        return lines;
    }

    // ------------------------------------------------------------ syntax highlighting

    var KEYWORDS = {
        js: "var let const function return if else for while do new this typeof instanceof try catch finally throw async await of in break continue switch case default class extends import export from null undefined true false",
        python: "def return if elif else for while in not and or is try except finally raise with as import from class lambda pass break continue yield global nonlocal None True False"
    };
    var PATTERNS = {
        js: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g,
        python: /(#[^\n]*)|([rfbRFB]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]\w*)/g
    };

    function highlight(code, lang) {
        var pre = h("pre"), codeEl = h("code");
        pre.appendChild(codeEl);
        var re = PATTERNS[lang];
        if (!re) { codeEl.textContent = code; return pre; }
        var kws = KEYWORDS[lang].split(" ");
        var last = 0, m;
        re.lastIndex = 0;
        function add(text, cls) {
            if (!text) return;
            if (!cls) { codeEl.appendChild(document.createTextNode(text)); return; }
            codeEl.appendChild(h("span", { "class": "tok-" + cls }, text));
        }
        while ((m = re.exec(code))) {
            add(code.slice(last, m.index));
            if (m[1]) add(m[1], "comment");
            else if (m[2]) add(m[2], "string");
            else if (m[3]) add(m[3], "number");
            else if (m[4]) {
                var word = m[4];
                if (kws.indexOf(word) !== -1) add(word, "keyword");
                else if (code.charAt(re.lastIndex) === "(") add(word, "function");
                else add(word);
            }
            last = re.lastIndex;
        }
        add(code.slice(last));
        return pre;
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
        }
        return fallbackCopy(text);
    }
    function fallbackCopy(text) {
        var area = h("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.top = "-1000px";
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(area);
        return ok ? Promise.resolve() : Promise.reject(new Error("copy failed"));
    }

    // ------------------------------------------------------------ rendering the SVG

    function render() {
        var maxCol = 0, maxRow = 0;
        data.nodes.forEach(function (n) {
            nodesById[n.id] = n;
            maxCol = Math.max(maxCol, n.pos[0]);
            maxRow = Math.max(maxRow, n.pos[1]);
        });
        fullView = { x: 0, y: 0, w: PAD * 2 + maxCol * COL_W + NODE_W, h: PAD * 2 + maxRow * ROW_H + NODE_H };
        setView(fullView);
        svg.style.aspectRatio = fullView.w + " / " + fullView.h;

        var defs = el("defs", {}, svg);
        ["arrow", "arrow-active"].forEach(function (id) {
            var marker = el("marker", { id: id, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
            el("path", { d: "M0,0 L10,5 L0,10 z", "class": id === "arrow" ? "arrowhead" : "arrowhead active" }, marker);
        });

        var edgeLayer = el("g", { "class": "edges", "aria-hidden": "true" }, svg);
        var labelLayer = el("g", { "class": "edge-labels", "aria-hidden": "true" }, svg);
        var flowLayer = el("g", { "class": "flow", "aria-hidden": "true" }, svg);
        var nodeLayer = el("g", { "class": "nodes" }, svg);

        data.edges.forEach(function (edge) {
            var a = center(nodesById[edge.from]), b = center(nodesById[edge.to]);
            var p1 = boxEdgePoint(a, b.x, b.y, 4), p2 = boxEdgePoint(b, a.x, a.y, 6);
            var path = el("path", {
                d: "M" + p1.x + "," + p1.y + " L" + p2.x + "," + p2.y,
                "class": "edge",
                "marker-end": "url(#arrow)"
            }, edgeLayer);
            if (edge.both) path.setAttribute("marker-start", "url(#arrow)");

            var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
            var g = el("g", { "class": "edge-label" }, labelLayer);
            var bg = el("rect", { rx: "6" }, g);
            var text = el("text", { x: mx, y: my, "text-anchor": "middle", "dominant-baseline": "central" }, g);
            text.textContent = edge.label;

            var dot = el("circle", { r: "4.5", "class": "flow-dot" }, flowLayer);
            edgeEls.push({ edge: edge, path: path, label: g, bg: bg, text: text, mx: mx, my: my, dot: dot, length: path.getTotalLength() });
        });
        sizeLabels();

        data.nodes.forEach(function (n) {
            var x = PAD + n.pos[0] * COL_W, y = PAD + n.pos[1] * ROW_H;
            var g = el("g", {
                "class": "node kind-" + n.kind,
                tabindex: "0",
                role: "button",
                "aria-label": n.label + ". " + n.summary,
                "data-id": n.id
            }, nodeLayer);
            el("rect", { x: x, y: y, width: NODE_W, height: NODE_H, rx: "12" }, g);
            var lines = wrapText(n.label, 17);
            var startY = y + NODE_H / 2 - (lines.length - 1) * 10.5;
            lines.forEach(function (line, i) {
                var t = el("text", { x: x + NODE_W / 2, y: startY + i * 21, "text-anchor": "middle", "dominant-baseline": "central" }, g);
                t.textContent = line;
            });
            g.addEventListener("click", function () { select(n.id, true); });
            // While zoomed in, Tab can reach nodes outside the view; pan to them.
            g.addEventListener("focus", function () {
                if (selectedId && selectedId !== n.id) zoomTo(n.id);
            });
            g.addEventListener("keydown", function (ev) {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(n.id, true); }
            });
            nodeEls[n.id] = g;
        });
    }

    // Label backgrounds are sized from the rendered text, which only has a size
    // while the diagram is displayed (it's hidden on narrow screens).
    function sizeLabels() {
        edgeEls.forEach(function (x) {
            var box = x.text.getBBox();
            if (!box.width) return;
            x.bg.setAttribute("x", box.x - 6);
            x.bg.setAttribute("y", box.y - 3);
            x.bg.setAttribute("width", box.width + 12);
            x.bg.setAttribute("height", box.height + 6);
        });
    }

    // ------------------------------------------------------------ small-screen list

    function renderList() {
        var list = $("nodeList");
        data.nodes.forEach(function (n) {
            var li = h("li");
            var btn = h("button", { type: "button", "class": "list-node kind-" + n.kind, "aria-expanded": "false", "data-id": n.id });
            btn.appendChild(h("span", { "class": "list-label" }, n.label));
            btn.appendChild(h("span", { "class": "list-summary" }, n.summary));
            btn.addEventListener("click", function () {
                if (selectedId === n.id) overview(); else select(n.id, true);
            });
            li.appendChild(btn);
            list.appendChild(li);
            listItems[n.id] = { li: li, btn: btn };
        });
    }

    // ------------------------------------------------------------ view / zoom

    function setView(v) {
        currentView = v;
        svg.setAttribute("viewBox", v.x + " " + v.y + " " + v.w + " " + v.h);
    }

    function animateView(target) {
        if (zoomFrame) cancelAnimationFrame(zoomFrame);
        if (REDUCED.matches || NARROW.matches) { setView(target); return; }
        var from = currentView, start = null;
        function step(ts) {
            if (start === null) start = ts;
            var t = Math.min(1, (ts - start) / ANIM_MS);
            var k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
            setView({
                x: from.x + (target.x - from.x) * k,
                y: from.y + (target.y - from.y) * k,
                w: from.w + (target.w - from.w) * k,
                h: from.h + (target.h - from.h) * k
            });
            if (t < 1) zoomFrame = requestAnimationFrame(step);
        }
        zoomFrame = requestAnimationFrame(step);
    }

    function zoomTo(id) {
        var c = center(nodesById[id]);
        var w = Math.min(ZOOM_WIDTH, fullView.w);
        var hgt = w * (fullView.h / fullView.w);
        animateView({ x: c.x - w / 2, y: c.y - hgt / 2, w: w, h: hgt });
    }

    // ------------------------------------------------------------ selection

    function connected(id) {
        var set = {};
        data.edges.forEach(function (edge) {
            if (edge.from === id) set[edge.to] = true;
            if (edge.to === id) set[edge.from] = true;
        });
        return set;
    }

    function select(id, moveFocus) {
        if (!nodesById[id]) return;
        selectedId = id;
        stopFlow();
        var neighbors = connected(id);
        svg.classList.add("has-selection");
        Object.keys(nodeEls).forEach(function (nid) {
            nodeEls[nid].classList.toggle("selected", nid === id);
            nodeEls[nid].classList.toggle("neighbor", !!neighbors[nid]);
            nodeEls[nid].setAttribute("aria-pressed", nid === id ? "true" : "false");
        });
        edgeEls.forEach(function (x) {
            var on = x.edge.from === id || x.edge.to === id;
            x.path.classList.toggle("active", on);
            x.label.classList.toggle("active", on);
            x.path.setAttribute("marker-end", on ? "url(#arrow-active)" : "url(#arrow)");
            if (x.edge.both) x.path.setAttribute("marker-start", on ? "url(#arrow-active)" : "url(#arrow)");
        });
        Object.keys(listItems).forEach(function (nid) {
            listItems[nid].btn.setAttribute("aria-expanded", nid === id ? "true" : "false");
        });
        zoomTo(id);
        renderDetail(nodesById[id]);
        $("overviewBtn").disabled = false;
        if (history.replaceState) history.replaceState(null, "", "#" + id);

        if (NARROW.matches) {
            // Show the details directly under the tapped item in the list.
            listItems[id].li.appendChild($("detail"));
            $("detail").hidden = false;
        }
        if (moveFocus) $("detail").focus({ preventScroll: !NARROW.matches });
    }

    function overview(restoreFocus) {
        var prev = selectedId;
        selectedId = null;
        svg.classList.remove("has-selection");
        Object.keys(nodeEls).forEach(function (nid) {
            nodeEls[nid].classList.remove("selected", "neighbor");
            nodeEls[nid].setAttribute("aria-pressed", "false");
        });
        edgeEls.forEach(function (x) {
            x.path.classList.remove("active");
            x.label.classList.remove("active");
            x.path.setAttribute("marker-end", "url(#arrow)");
            if (x.edge.both) x.path.setAttribute("marker-start", "url(#arrow)");
        });
        Object.keys(listItems).forEach(function (nid) { listItems[nid].btn.setAttribute("aria-expanded", "false"); });
        animateView(fullView);
        $("detailEmpty").hidden = false;
        $("detailBody").hidden = true;
        $("detail").setAttribute("aria-labelledby", "detailEmptyTitle");
        $("overviewBtn").disabled = true;
        if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
        if (NARROW.matches) {
            $("detail").hidden = true;
            $("archLayout").appendChild($("detail"));
        }
        if (restoreFocus && prev) {
            var target = NARROW.matches ? listItems[prev].btn : nodeEls[prev];
            if (target) target.focus();
        }
    }

    // ------------------------------------------------------------ detail panel

    function section(title) {
        var s = h("section", { "class": "detail-section" });
        s.appendChild(h("h4", {}, title));
        return s;
    }

    function renderDetail(n) {
        var body = $("detailBody");
        body.textContent = "";
        $("detailEmpty").hidden = true;
        body.hidden = false;
        $("detail").setAttribute("aria-labelledby", "detailTitle");

        var kinds = { client: "Browser", host: "Hosting", page: "Page", link: "Links", module: "Module", data: "Data", external: "External service" };
        body.appendChild(h("p", { "class": "detail-kind" }, kinds[n.kind] || n.kind));
        body.appendChild(h("h3", { id: "detailTitle", "class": "detail-title" }, n.label));
        body.appendChild(h("p", { "class": "detail-summary" }, n.summary));

        var does = section("What it does");
        does.appendChild(h("p", {}, n.does));
        body.appendChild(does);

        if (n.code && n.code.length) {
            var code = section(n.code.length > 1 ? "Code excerpts" : "Code excerpt");
            n.code.forEach(function (c) {
                var fig = h("figure", { "class": "code-fig" });
                var cap = h("figcaption");
                var a = h("a", { href: data.repo + "/blob/" + data.branch + "/" + c.file, target: "_blank", rel: "noopener noreferrer" }, c.file);
                cap.appendChild(a);
                var btn = h("button", { type: "button", "class": "copy-btn", "aria-label": "Copy code from " + c.file }, "Copy");
                var timer = null;
                btn.addEventListener("click", function () {
                    copyText(c.snippet).then(function () {
                        btn.textContent = "Copied!";
                        btn.classList.add("copied");
                    }, function () { btn.textContent = "Press Ctrl+C"; });
                    clearTimeout(timer);
                    timer = setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1800);
                });
                cap.appendChild(btn);
                fig.appendChild(cap);
                var pre = highlight(c.snippet, c.lang);
                pre.setAttribute("tabindex", "0");
                pre.setAttribute("aria-label", "Code from " + c.file);
                fig.appendChild(pre);
                code.appendChild(fig);
            });
            body.appendChild(code);
        }

        var dec = section("Design decision");
        dec.appendChild(h("p", {}, n.decision));
        if (n.tradeoffs && n.tradeoffs.length) {
            dec.appendChild(h("h5", {}, "Tradeoffs"));
            var ul = h("ul");
            n.tradeoffs.forEach(function (t) { ul.appendChild(h("li", {}, t)); });
            dec.appendChild(ul);
        }
        if (n.todo) {
            var todo = h("p", { "class": "todo" });
            todo.appendChild(h("strong", {}, "Note to self: "));
            todo.appendChild(document.createTextNode(n.todo));
            dec.appendChild(todo);
        }
        body.appendChild(dec);

        var links = data.edges.filter(function (edge) { return edge.from === n.id || edge.to === n.id; });
        if (links.length) {
            var con = section("Connections");
            var cl = h("ul", { "class": "connections" });
            links.forEach(function (edge) {
                var other = edge.from === n.id ? edge.to : edge.from;
                var dir = edge.both ? "↔" : (edge.from === n.id ? "→" : "←");
                var li = h("li");
                var b = h("button", { type: "button", "class": "link-btn" }, dir + " " + nodesById[other].label);
                b.addEventListener("click", function () { select(other, true); });
                li.appendChild(b);
                li.appendChild(document.createTextNode(": " + edge.detail));
                cl.appendChild(li);
            });
            con.appendChild(cl);
            body.appendChild(con);
        }

        if (n.link || (n.buildLog && n.buildLog.length)) {
            var more = section("Related");
            if (n.link) {
                more.appendChild(h("a", { "class": "btn btn-accent related-link", href: n.link.href }, n.link.label + " →"));
            }
            if (n.buildLog && n.buildLog.length) {
                more.appendChild(h("h5", {}, "From the build log"));
                var bl = h("ul", { "class": "log-links" });
                n.buildLog.forEach(function (ref) {
                    var li = h("li");
                    li.appendChild(h("a", { href: "build-log/#" + ref }, logTitles[ref] || ref));
                    bl.appendChild(li);
                });
                more.appendChild(bl);
            }
            body.appendChild(more);
        }
    }

    // ------------------------------------------------------------ data-flow animation

    var flowFrame = null, flowStart = null, flowElapsed = 0, flowPlaying = false;

    function drawFlow(elapsed) {
        edgeEls.forEach(function (x, i) {
            // Stagger edges a little so the flow reads from browser down to the check logic.
            var t = ((elapsed / FLOW_MS) - i * 0.06) % 1;
            if (t < 0) { x.dot.style.opacity = 0; return; }
            var p = x.path.getPointAtLength(t * x.length);
            x.dot.setAttribute("cx", p.x);
            x.dot.setAttribute("cy", p.y);
            x.dot.style.opacity = t < 0.1 ? t * 10 : t > 0.9 ? (1 - t) * 10 : 1;
        });
    }

    function flowStep(ts) {
        if (flowStart === null) flowStart = ts - flowElapsed;
        flowElapsed = ts - flowStart;
        if (flowElapsed >= FLOW_MS * FLOW_RUNS) { finishFlow(); return; }
        drawFlow(flowElapsed);
        flowFrame = requestAnimationFrame(flowStep);
    }

    function playFlow() {
        if (REDUCED.matches || selectedId) return;
        if (flowElapsed >= FLOW_MS * FLOW_RUNS) flowElapsed = 0;
        flowPlaying = true;
        flowStart = null;
        svg.classList.add("flowing");
        $("animBtn").textContent = "Pause animation";
        $("animBtn").setAttribute("aria-pressed", "false");
        flowFrame = requestAnimationFrame(flowStep);
    }

    function pauseFlow() {
        flowPlaying = false;
        if (flowFrame) cancelAnimationFrame(flowFrame);
        $("animBtn").textContent = "Play animation";
        $("animBtn").setAttribute("aria-pressed", "true");
    }

    function stopFlow() {
        if (flowFrame) cancelAnimationFrame(flowFrame);
        flowPlaying = false;
        flowElapsed = FLOW_MS * FLOW_RUNS;
        svg.classList.remove("flowing");
        updateAnimButton();
    }

    function finishFlow() {
        stopFlow();
    }

    function updateAnimButton() {
        var btn = $("animBtn");
        if (REDUCED.matches) {
            btn.textContent = "Animation off (reduced motion)";
            btn.disabled = true;
            return;
        }
        btn.disabled = false;
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = flowPlaying ? "Pause animation" : "Replay animation";
    }

    // ------------------------------------------------------------ wiring

    function onKeydown(ev) {
        if (ev.key === "Escape" && selectedId) {
            ev.preventDefault();
            overview(true);
        }
    }

    function applyNarrow() {
        if (!NARROW.matches) sizeLabels();
        if (selectedId) {
            var id = selectedId;
            overview(false);
            select(id, false);
        } else if (!NARROW.matches) {
            $("detail").hidden = false;
            $("archLayout").appendChild($("detail"));
        } else {
            $("detail").hidden = true;
        }
    }

    function init(arch, log) {
        data = arch;
        (log.entries || []).forEach(function (x) { logTitles[x.id] = x.title; });

        $("toolbar").hidden = false;
        $("archLayout").hidden = false;
        $("archStatus").hidden = true;
        // The text version stays in the page for screen readers and no-JS
        // visitors; with the diagram available it starts collapsed.
        $("textDetails").open = false;

        render();
        renderList();
        if (NARROW.matches) $("detail").hidden = true;

        $("overviewBtn").addEventListener("click", function () { overview(true); });
        $("animBtn").addEventListener("click", function () {
            if (flowPlaying) pauseFlow(); else playFlow();
        });
        document.addEventListener("keydown", onKeydown);
        (NARROW.addEventListener ? NARROW.addEventListener("change", applyNarrow) : NARROW.addListener(applyNarrow));
        (REDUCED.addEventListener ? REDUCED.addEventListener("change", function () {
            if (REDUCED.matches) stopFlow(); else updateAnimButton();
        }) : null);

        var hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
        if (nodesById[hashId]) {
            updateAnimButton();
            stopFlow();
            select(hashId, false);
        } else if (REDUCED.matches) {
            updateAnimButton();
        } else {
            playFlow();
        }
    }

    function getJSON(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error(url + ": HTTP " + r.status);
            return r.json();
        });
    }

    Promise.all([
        getJSON("architecture.json"),
        getJSON("build-log/build-log.json").catch(function () { return { entries: [] }; })
    ]).then(function (results) {
        init(results[0], results[1]);
    }).catch(function (err) {
        $("archStatus").textContent = "The interactive diagram couldn't load (" + err.message + "). The full text version is below.";
    });
})();

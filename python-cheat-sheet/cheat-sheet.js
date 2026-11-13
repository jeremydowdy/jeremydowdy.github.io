// Adds a small "Copy" button to every code example on the cheat sheet.
(function () {
    "use strict";

    function fallbackCopy(text) {
        // For browsers without the async clipboard API (or non-HTTPS pages).
        var area = document.createElement("textarea");
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

    function copy(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
        }
        return fallbackCopy(text);
    }

    Array.prototype.forEach.call(document.querySelectorAll(".code-block"), function (block) {
        var caption = block.querySelector("figcaption");
        var code = block.querySelector("pre code");
        if (!caption || !code) return;

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "copy-btn";
        btn.textContent = "Copy";
        btn.setAttribute("aria-label", "Copy code: " + caption.textContent);
        var timer = null;

        btn.addEventListener("click", function () {
            copy(code.textContent).then(function () {
                btn.textContent = "Copied!";
                btn.classList.add("copied");
            }, function () {
                btn.textContent = "Press Ctrl+C";
                var range = document.createRange();
                range.selectNodeContents(code);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            });
            clearTimeout(timer);
            timer = setTimeout(function () {
                btn.textContent = "Copy";
                btn.classList.remove("copied");
            }, 1800);
        });

        caption.appendChild(btn);
    });
})();

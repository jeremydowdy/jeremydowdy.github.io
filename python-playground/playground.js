// Python Playground page logic: lessons, editor, and talking to the
// Pyodide worker (worker.js). All Python runs in the browser.
(function () {
    "use strict";

    var LESSONS = window.LESSONS;
    var TIMEOUT_MS = 10000;
    var CHEAT_SECTIONS = {
        "variables": "variables",
        "conditionals": "conditionals",
        "loops": "loops",
        "lists-dicts": "collections",
        "functions": "functions"
    };

    var $ = function (id) { return document.getElementById(id); };

    // localStorage can be unavailable (private mode, blocked storage), so
    // every access is wrapped and the page still works without it.
    var store = {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
        remove: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    };
    var codeKey = function (lesson) { return "pyplay:code:" + lesson.id; };

    function getDone() {
        try { return JSON.parse(store.get("pyplay:done")) || []; } catch (e) { return []; }
    }
    function markDone(id) {
        var done = getDone();
        if (done.indexOf(id) === -1) { done.push(id); store.set("pyplay:done", JSON.stringify(done)); }
    }

    var worker = null;
    var ready = false;
    var running = null;   // { id, isCheck }
    var runCounter = 0;
    var timer = null;
    var index = 0;
    var loading = false;  // true while a lesson's code is being swapped in

    var editor = window.PyEditor.create($("editor"), "", {
        label: "Python code editor. Press Escape then Tab to move focus out.",
        onRun: function () { run(false); },
        onChange: function () {
            if (!loading) store.set(codeKey(LESSONS[index]), editor.getCode());
        }
    });

    // ---------------- Status + buttons ----------------

    function setStatus(state, text) {
        var el = $("status");
        el.className = "pg-status" + (state === "ready" ? " is-ready" : state === "error" ? " is-error" : "");
        $("statusText").textContent = text;
        $("retryBtn").hidden = state !== "error";
    }

    function updateButtons() {
        $("runBtn").disabled = !ready || !!running;
        $("checkBtn").disabled = !ready || !!running;
        $("runBtn").textContent = running && !running.isCheck ? "Running…" : "▶ Run";
        $("checkBtn").textContent = running && running.isCheck ? "Checking…" : "✓ Check";
    }

    // ---------------- Worker ----------------

    function startWorker(message) {
        ready = false;
        setStatus("loading", message || "Loading Python… the first visit downloads about 10 MB.");
        updateButtons();
        try {
            worker = new Worker("worker.js");
        } catch (e) {
            setStatus("error", "Your browser couldn't start Python here (" + e.message + ").");
            return;
        }
        worker.onmessage = onWorkerMessage;
        worker.onerror = function (e) {
            e.preventDefault();
            loadFailed(e.message || "unknown error");
        };
    }

    function loadFailed(detail) {
        ready = false;
        if (worker) worker.terminate();
        worker = null;
        setStatus("error", "Couldn't load Python. Check your connection, then try again." + (detail ? " (" + detail + ")" : ""));
        updateButtons();
    }

    function onWorkerMessage(event) {
        var m = event.data;
        if (m.type === "ready") {
            ready = true;
            setStatus("ready", "Python is ready.");
            updateButtons();
        } else if (m.type === "load-error") {
            loadFailed(m.message);
        } else if (running && m.id === running.id) {
            if (m.type === "out") appendOutput(m.text, m.stream === "stderr" ? "out-stderr" : null);
            else if (m.type === "done") finishRun(m);
        }
    }

    // ---------------- Output ----------------

    var output = $("output");
    var hasOutput = false;
    var scrollQueued = false;

    function scrollOutput() {
        if (scrollQueued) return;
        scrollQueued = true;
        requestAnimationFrame(function () {
            scrollQueued = false;
            output.scrollTop = output.scrollHeight;
        });
    }

    function clearOutput(placeholder) {
        output.textContent = "";
        hasOutput = false;
        if (placeholder) {
            var span = document.createElement("span");
            span.className = "out-faint";
            span.textContent = placeholder;
            output.appendChild(span);
        }
    }

    function appendOutput(text, cls) {
        if (!hasOutput) { output.textContent = ""; hasOutput = true; }
        var last = output.lastChild;
        if (!cls && last && last.nodeType === 3) {
            last.appendData(text);
        } else if (cls) {
            var span = document.createElement("span");
            span.className = cls;
            span.textContent = text;
            output.appendChild(span);
        } else {
            output.appendChild(document.createTextNode(text));
        }
        scrollOutput();
    }

    function appendError(traceback) {
        if (!hasOutput) { output.textContent = ""; hasOutput = true; }
        var box = document.createElement("span");
        box.className = "out-error";
        var title = document.createElement("span");
        title.className = "out-error-title";
        // The last line of a traceback names the error, e.g. "NameError: name 'x' is not defined"
        var text = traceback.replace(/\s+$/, "");
        var lines = text.split("\n");
        title.textContent = "Error: " + lines[lines.length - 1];
        box.appendChild(title);
        box.appendChild(document.createTextNode(text));
        output.appendChild(box);
        scrollOutput();
    }

    // ---------------- Check result ----------------

    function hideResult() {
        $("result").hidden = true;
        $("result").textContent = "";
    }

    function showResult(passed, hint) {
        var el = $("result");
        el.className = "result " + (passed ? "pass" : "fail");
        el.textContent = "";
        var strong = document.createElement("strong");
        strong.textContent = passed ? "✓ Passed! Nice work." : "✗ Not quite yet";
        el.appendChild(strong);
        var p = document.createElement("p");
        p.textContent = passed
            ? (index < LESSONS.length - 1 ? "Ready for the next lesson?" : "That's every lesson. Try changing the code to experiment, or keep the cheat sheet handy for what's next.")
            : hint;
        el.appendChild(p);
        if (passed && index < LESSONS.length - 1) {
            var next = document.createElement("button");
            next.type = "button";
            next.className = "btn btn-accent";
            next.textContent = "Next: " + LESSONS[index + 1].title + " →";
            next.addEventListener("click", function () { goTo(index + 1); });
            el.appendChild(next);
        }
        el.hidden = false;
    }

    // ---------------- Running code ----------------

    function run(isCheck) {
        if (!ready || running) return;
        hideResult();
        clearOutput();
        var id = ++runCounter;
        running = { id: id, isCheck: isCheck };
        updateButtons();
        worker.postMessage({
            type: "run",
            id: id,
            code: editor.getCode(),
            check: isCheck ? LESSONS[index].check : null
        });
        timer = setTimeout(function () { timedOut(isCheck); }, TIMEOUT_MS);
    }

    function timedOut(isCheck) {
        worker.terminate();
        worker = null;
        running = null;
        appendError("TimeoutError: your code ran for more than " + (TIMEOUT_MS / 1000) + " seconds and was stopped.\n" +
            "This usually means a loop never ends, like a while loop whose condition never becomes False.");
        if (isCheck) showResult(false, "Your code didn't finish. Look for a loop that never stops.");
        startWorker("Restarting Python after the stopped run…");
    }

    function finishRun(m) {
        clearTimeout(timer);
        var wasCheck = running.isCheck;
        running = null;
        if (m.error) appendError(m.error);
        if (!hasOutput) clearOutput("(Your code ran but didn't print anything.)");
        if (wasCheck && m.check) {
            showResult(m.check.passed, m.check.hint);
            if (m.check.passed) { markDone(LESSONS[index].id); renderTabs(); }
        }
        updateButtons();
    }

    // ---------------- Lessons ----------------

    function renderTabs() {
        var done = getDone();
        var list = $("lessonList");
        list.textContent = "";
        LESSONS.forEach(function (lesson, i) {
            var li = document.createElement("li");
            var a = document.createElement("a");
            a.href = "#" + lesson.id;
            if (i === index) a.setAttribute("aria-current", "step");
            var isDone = done.indexOf(lesson.id) !== -1;
            if (isDone) a.className = "done";
            var num = document.createElement("span");
            num.className = "num";
            num.textContent = isDone ? "✓" : String(i + 1);
            a.appendChild(num);
            a.appendChild(document.createTextNode(lesson.title));
            if (isDone) {
                var sr = document.createElement("span");
                sr.className = "sr-only";
                sr.textContent = " (completed)";
                a.appendChild(sr);
            }
            li.appendChild(a);
            list.appendChild(li);
        });
    }

    function showLesson(i) {
        index = i;
        var lesson = LESSONS[i];
        $("lessonNum").textContent = "Lesson " + (i + 1) + " of " + LESSONS.length;
        $("lessonTitle").textContent = lesson.title;
        $("lessonIntro").innerHTML = lesson.intro;   // trusted, from lessons.js
        $("lessonTask").innerHTML = lesson.task;
        $("cheatLink").href = "../python-cheat-sheet/#" + (CHEAT_SECTIONS[lesson.id] || "");
        document.title = lesson.title + " · Python Playground | Jeremy Dowdy";

        loading = true;
        editor.setCode(store.get(codeKey(lesson)) || lesson.starter);
        loading = false;

        $("prevBtn").hidden = i === 0;
        $("nextBtn").hidden = i === LESSONS.length - 1;
        hideResult();
        clearOutput("Press Run to see what your code prints.");
        renderTabs();
    }

    function indexFromHash() {
        var id = decodeURIComponent(location.hash.replace(/^#/, ""));
        for (var i = 0; i < LESSONS.length; i++) if (LESSONS[i].id === id) return i;
        return -1;
    }

    function goTo(i) {
        location.hash = LESSONS[i].id;   // hashchange calls showLesson
    }

    window.addEventListener("hashchange", function () {
        var i = indexFromHash();
        if (i !== -1 && i !== index) {
            showLesson(i);
            $("lessonTitle").scrollIntoView({ block: "start" });
        }
    });

    // ---------------- Wire up ----------------

    $("runBtn").addEventListener("click", function () { run(false); });
    $("checkBtn").addEventListener("click", function () { run(true); });
    $("clearBtn").addEventListener("click", function () { clearOutput(); hideResult(); });
    $("retryBtn").addEventListener("click", function () { startWorker(); });
    $("prevBtn").addEventListener("click", function () { if (index > 0) goTo(index - 1); });
    $("nextBtn").addEventListener("click", function () { if (index < LESSONS.length - 1) goTo(index + 1); });
    $("resetBtn").addEventListener("click", function () {
        var lesson = LESSONS[index];
        if (editor.getCode() !== lesson.starter &&
            !window.confirm("Reset to the starter code? Your changes to this lesson will be lost.")) return;
        store.remove(codeKey(lesson));
        loading = true;
        editor.setCode(lesson.starter);
        loading = false;
        hideResult();
        clearOutput("Code reset to the starter. Press Run to try it.");
        editor.focus();
    });

    var start = indexFromHash();
    showLesson(start === -1 ? 0 : start);
    startWorker();
})();

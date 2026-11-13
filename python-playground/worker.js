// Runs Python with Pyodide in a Web Worker, so a slow or infinite loop
// never freezes the page. The page can terminate this worker and start a
// fresh one if code runs too long.
//
// Messages in:  { type: "run", id, code, check }
// Messages out: { type: "ready" } | { type: "load-error", message }
//               { type: "out", id, stream: "stdout" | "stderr", text }
//               { type: "done", id, error, check }

/* global loadPyodide, importScripts */
const PYODIDE_VERSION = "0.29.5";
const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";
const MAX_OUTPUT_CHARS = 50000; // stop streaming after this much output

const HARNESS = String.raw`
import builtins, contextlib, io, json, linecache, re, sys, traceback

FILENAME = "main.py"
_last = {"ns": {}, "code": ""}

def _no_input(prompt=""):
    raise RuntimeError(
        "input() can't read from the keyboard in this playground. "
        "Assign a value instead, for example: name = \"Ada\""
    )

def _format_error(e):
    # Skip the playground's own frames so the traceback starts at the user's code.
    tb = e.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename != FILENAME:
        tb = tb.tb_next
    return "".join(traceback.format_exception(type(e), e, tb))

def _exec(code, ns):
    linecache.cache[FILENAME] = (len(code), None, code.splitlines(True), FILENAME)
    exec(compile(code, FILENAME, "exec"), ns)

def _fresh_ns():
    return {"__name__": "__main__", "__builtins__": builtins}

def run_user(code):
    builtins.input = _no_input
    ns = _fresh_ns()
    _last["ns"], _last["code"] = ns, code
    try:
        _exec(code, ns)
        return json.dumps({"error": None})
    except BaseException as e:  # includes SystemExit / KeyboardInterrupt from user code
        return json.dumps({"error": _format_error(e)})
    finally:
        # Push out anything still buffered so it shows up and can be checked.
        sys.stdout.flush()
        sys.stderr.flush()

def run_with(**overrides):
    """Re-run the user's code with some top-level assignments replaced,
    e.g. run_with(score=95). Output is captured, not shown. Returns the namespace."""
    code = _last["code"]
    for name, value in overrides.items():
        pattern = re.compile(r"^" + re.escape(name) + r"\s*=.*$", re.M)
        code, n = pattern.subn(lambda m: name + " = " + repr(value), code, count=1)
        if n == 0:
            raise AssertionError(f"Keep the line that sets {name} = ... so it can be tested with other values.")
    ns = _fresh_ns()
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        _exec(code, ns)
    ns["__output__"] = buf.getvalue()
    return ns

def run_check(check, output):
    env = {
        "ns": _last["ns"],
        "code": _last["code"],
        "output": output,
        "lines": [l.rstrip() for l in output.strip().splitlines()],
        "run_with": run_with,
    }
    try:
        exec(check, env)
        return json.dumps({"passed": True, "hint": None})
    except AssertionError as e:
        return json.dumps({"passed": False, "hint": str(e) or "Not quite. Compare your output with the task."})
    except Exception as e:
        return json.dumps({"passed": False, "hint": f"Your code hit an error while being checked: {type(e).__name__}: {e}"})
`;

let pyodide = null;
let runUser = null;
let runCheck = null;
let current = null; // { id, output, truncated, pending: [{stream, text}], lastFlush }

// Output is batched: Python runs synchronously here, so instead of one
// message per print() we send what has built up every ~50 ms (or 4 KB).
function flush() {
    if (!current || !current.pending.length) return;
    let batch = null;
    for (const part of current.pending) {
        if (batch && batch.stream === part.stream) {
            batch.text += part.text;
        } else {
            if (batch) postMessage(batch);
            batch = { type: "out", id: current.id, stream: part.stream, text: part.text };
        }
    }
    postMessage(batch);
    current.pending = [];
    current.pendingSize = 0;
    current.lastFlush = Date.now();
}

function emit(stream, text) {
    if (!current || !text) return;
    if (current.output.length >= MAX_OUTPUT_CHARS) {
        if (!current.truncated) {
            current.truncated = true;
            current.pending.push({ stream: "stderr", text: "\n[Output truncated: too much output]\n" });
            flush();
        }
        return;
    }
    current.output += text;
    current.pending.push({ stream, text });
    current.pendingSize += text.length;
    if (current.pendingSize > 4096 || Date.now() - current.lastFlush > 50) flush();
}

const ready = (async () => {
    importScripts(PYODIDE_BASE + "pyodide.js");
    pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
    // Raw (unbuffered) handlers, so text printed with end="" isn't lost.
    const outDecoder = new TextDecoder();
    const errDecoder = new TextDecoder();
    pyodide.setStdout({ write: buf => { emit("stdout", outDecoder.decode(buf, { stream: true })); return buf.length; } });
    pyodide.setStderr({ write: buf => { emit("stderr", errDecoder.decode(buf, { stream: true })); return buf.length; } });
    pyodide.runPython(HARNESS);
    runUser = pyodide.globals.get("run_user");
    runCheck = pyodide.globals.get("run_check");
})();

ready.then(
    () => postMessage({ type: "ready" }),
    err => postMessage({ type: "load-error", message: String((err && err.message) || err) })
);

onmessage = async event => {
    const msg = event.data;
    if (msg.type !== "run") return;
    try {
        await ready;
    } catch (e) {
        return;
    }

    current = { id: msg.id, output: "", truncated: false, pending: [], pendingSize: 0, lastFlush: Date.now() };
    let result = { error: null };
    let check = null;
    try {
        result = JSON.parse(runUser(msg.code));
        if (msg.check) {
            check = result.error
                ? { passed: false, hint: "Your code raised an error. Fix it first (see the output panel), then check again." }
                : JSON.parse(runCheck(msg.check, current.output));
        }
    } catch (e) {
        result = { error: "Playground error: " + String((e && e.message) || e) };
    }
    flush();
    const id = current.id;
    current = null;
    postMessage({ type: "done", id, error: result.error, check });
};

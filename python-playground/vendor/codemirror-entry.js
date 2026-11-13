// Source for python-playground/vendor/codemirror.min.js
// Built with: esbuild entry.js --bundle --minify --format=iife --global-name=PyEditor
import { EditorState } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { tags as t } from "@lezer/highlight";

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "#c792ea" },
  { tag: [t.controlKeyword, t.definitionKeyword, t.operatorKeyword], color: "#c792ea" },
  { tag: [t.string, t.special(t.string)], color: "#a5e075" },
  { tag: [t.number, t.bool, t.null], color: "#f78c6c" },
  { tag: t.comment, color: "#7f8b99", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#82aaff" },
  { tag: t.definition(t.variableName), color: "#ffffff" },
  { tag: [t.className, t.definition(t.className)], color: "#ffcb6b" },
  { tag: t.propertyName, color: "#89ddff" },
  { tag: [t.operator, t.punctuation], color: "#d0d0d0" },
  { tag: t.self, color: "#ff7a90" }
]);

const theme = EditorView.theme({
  "&": { color: "#f4f4f4", backgroundColor: "transparent", height: "100%" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.6" },
  ".cm-content": { caretColor: "#00ff66", padding: "12px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#00ff66", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(130, 170, 255, 0.3) !important" },
  ".cm-gutters": { backgroundColor: "transparent", color: "rgba(255,255,255,0.35)", border: "none" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.05)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "rgba(255,255,255,0.8)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "rgba(0,255,102,0.2)", outline: "none" },
  "&.cm-focused": { outline: "none" }
}, { dark: true });

export function create(parent, doc, { onRun, onChange, label } = {}) {
  const runKey = { key: "Mod-Enter", preventDefault: true, run: () => { if (onRun) onRun(); return true; } };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
        history(), indentOnInput(), bracketMatching(), closeBrackets(),
        indentUnit.of("    "), EditorState.tabSize.of(4),
        python(), syntaxHighlighting(highlight), theme,
        keymap.of([runKey, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.contentAttributes.of({ "aria-label": label || "Python code editor" }),
        EditorView.updateListener.of(u => { if (u.docChanged && onChange) onChange(); })
      ]
    })
  });
  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode: code => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
    focus: () => view.focus()
  };
}

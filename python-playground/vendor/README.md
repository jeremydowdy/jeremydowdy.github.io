# Vendored editor

`codemirror.min.js` is CodeMirror 6 bundled into one file, so the playground doesn't depend on a CDN resolving CodeMirror's many small packages. It exposes `window.PyEditor.create(parent, code, options)`.

To rebuild it, start from `codemirror-entry.js`:

```sh
npm i codemirror@6.0.2 @codemirror/lang-python@6.2.1 @codemirror/view @codemirror/state \
      @codemirror/commands @codemirror/language @codemirror/autocomplete esbuild
npx esbuild codemirror-entry.js --bundle --minify --format=iife --global-name=PyEditor \
      --legal-comments=none --outfile=codemirror.min.js
```

Then add back the MIT license header at the top of the file. CodeMirror is MIT licensed: https://codemirror.net

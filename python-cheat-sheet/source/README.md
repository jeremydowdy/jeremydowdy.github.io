# Cheat sheet source

`../index.html` is generated from `generate.py` (the content) and `template.html` (the page around it). To change the cheat sheet:

1. Edit the `sec(...)` calls in `generate.py`.
2. Run `python3 generate.py test` to execute every runnable example with real Python.
3. Run `python3 generate.py build template.html > ../index.html` to rebuild the page.

Generating the page this way means every example is HTML-escaped the same way and can be tested before it's published.

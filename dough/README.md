# Dough calculator

Self-contained static calculator at /dough/. The portfolio homepage adds one entry in the existing Published list; existing styles and other content are unchanged.

## Math
Diameter mode estimates dough weight using pizza area in square inches times a configurable-in-source thickness factor (thin 1.8, regular 2.3, thick 2.8 grams per square inch). Weight mode uses an explicit ball weight.
Total mass = ball weight × count.
Flour = total mass / (1 + sum of water, salt, instant dry yeast, oil, and sugar percentages / 100).
Every additional ingredient equals flour mass × its baker's percentage / 100.
Diameter estimates are independent of Dough Guy's implementation and do not claim recipe equivalence. Wheat-flour recipes only; yeast and fermentation are manually selected.

## Preview and approval
Review the feature branch before approving a merge. No main-branch publication is authorized yet.
The HTML is self-contained for third-party branch previews; manifest and service-worker features are intended for the permanent /dough/ address.
Service-worker registration is limited to the portfolio's domains and localhost.

## Storage and offline
Named recipes and batch notes are stored in browser localStorage. Duplicate names require confirmation before replacement; deletion requires confirmation. Copy recipe for a text backup.
The service worker only caches this application's explicit assets within /dough/ and only deletes caches prefixed jeremy-dough-. Bump the cache version when changing assets.
iPhone: Safari → Share → Add to Home Screen, with Open as Web App enabled if offered.

## Validation
JavaScript syntax, ingredient mass balance, linear batch scaling, and thickness ordering checked in an isolated JavaScript runtime.
Browser layout, actual iOS home-screen installation, clipboard, printing and service-worker/offline behavior require browser/device verification; no execution/browser host was available in this session.

# Changes: recruiter-readiness pass (home page)

## What this is
A second, reversible theme for `index.html`. The original look is preserved exactly
(verified by pixel diff at 1280x800 and 390x844, fold and full page: zero differing pixels).

## How it works
- `styles.original.css`: the previous inline stylesheet, moved verbatim. Drives `data-theme="original"`.
- `styles.recruiter.css`: every rule scoped to `html[data-theme="recruiter"]`.
- `index.html` head script sets `data-theme` on `<html>` before paint, from (in order) `?theme=`, localStorage `siteTheme`, then `DEFAULT_THEME`.
- Content that only one theme shows is marked `orig-only` / `rec-only`.
- **Default is `original`.** Visitors never see the recruiter theme unless you switch the default.
- Toggle: open `/?preview=1` once (remembered in localStorage). A "Theme" button appears bottom-left; the choice is saved in localStorage. `/?preview=0` hides the button; `/?theme=recruiter` forces a theme for one view.

## Go live with recruiter
Change `var DEFAULT_THEME = 'original';` to `'recruiter'` in the head script of `index.html`.

## Revert (either works)
- One line: set `DEFAULT_THEME` back to `'original'`.
- Or undo the whole pass: `git revert <commit-sha>` (the commit titled "Recruiter-readiness pass ...").

## Recruiter theme changes
Contact row (Email, Resume, GitHub, LinkedIn) above the fold; certification links to your Credly profile; two Education entries; hero focus line; trimmed About; a tech-stack line per project card (descriptions unchanged); dimmed golf hero (opaque overlay for AA contrast), solid dark page, solid cards, one gold accent; meta description, Open Graph and Twitter tags; reduced-motion support; labelled, keyboard-accessible toggle.
Also (both themes, no visual change): chat button `aria-label` now contains its visible text.
Compressed hero images: `assets/hero-1600.jpg` (~154 KB) and `assets/hero-800.jpg` (~43 KB) vs the 1.39 MB original (still used by the original theme).

## Checks
- axe-core: 0 violations on both themes at desktop and mobile. Hero text contrast can't be measured by axe over an image; worst case (white photo pixel under the overlay) computes to >= 4.7:1.
- Lighthouse accessibility (recruiter): 100.
- Toggle persists across reload; fresh visitors get original with no toggle.

## Placeholders / owner decisions
- `[EMAIL]` and `[RESUME_PATH]` (contact row)
- Hero focus line (`[PLACEHOLDER: owner to confirm wording]`)
- Trimmed About wording needs approval
- Credly: all four certs link to the profile `https://www.credly.com/users/jeremy-dowdy.a7d61c62`; each has a TODO for its own badge URL
- `[OG_IMAGE_PATH]` for og:image / twitter:image
- GitHub URL `https://github.com/jeremydowdy` was derived from the repo owner; confirm
- Tech-stack lines are my reading of each project; confirm
- The AI assistant is unchanged and still answers only from owner-provided information

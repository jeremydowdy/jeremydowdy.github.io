# Changes: home page refresh

## History
A reversible "recruiter" theme was built and then dropped (owner didn't like it). It lives in git history:
commits `ca723de` through `538d737`. Last commit that still has it: `538d737`.

## Current home page
- Look is the original golf hero + glass cards. CSS now lives in `styles.css` (was inline).
- Added life: entrance fade-ups, hover lifts on project and cert cards, green accent edges, tech-stack chips on each project, education timeline, GitHub button.
- Reduced-motion support; focus rings; axe-core 0 violations.
- Certifications: each links to its PDF in `assets/certs/` (LPI Linux Essentials, CompTIA Security+, CompTIA SecurityX, ITIL 4). Renew by overwriting the PDF with the same filename. One "View all badges on Credly" pill links to the Credly profile.
- Meta description plus Open Graph / Twitter title and description added. No share image yet.

## Not done / owner items
- AWS Certified Cloud Practitioner has no PDF link: the uploaded file is an exam results notice (candidate ID, registration number, score). Send the actual certificate or a redacted copy.
- Email and resume links were dropped (no real values yet). Add when ready.
- GitHub URL `https://github.com/jeremydowdy` was derived from the repo owner; confirm.
- Share image (`og:image`) not set.

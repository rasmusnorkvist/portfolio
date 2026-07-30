# CLAUDE.md — Frontend Website Rules

## Always Do First

- **Invoke the `frontend-design` skill** before writing any frontend code, every session.

## Reference Images

- If a reference image is provided: match layout, spacing, typography, and color exactly.
- If no reference image: design from scratch with high craft (see guardrails below).
- Screenshot your output, compare against the reference, fix mismatches, and re-screenshot. Do not stop after one screenshot pass.

## Local Server

- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `node serve.mjs` (serves the project root at `http://localhost:3000`).
- `serve.mjs` lives in the project root. Start it in the background before taking any screenshots.
- If the server is already running, do not start a second instance.

## Screenshot Workflow

- Puppeteer is installed at `C:/Users/nateh/AppData/Local/Temp/puppeteer-test/`.
- **Always screenshot from localhost:** `node screenshot.mjs http://localhost:3000`.
- Screenshots are saved automatically to `./temporary screenshots/screenshot-N.png`.
- Optional label suffix: `node screenshot.mjs http://localhost:3000 label` → saves as a labeled screenshot.
- `screenshot.mjs` lives in the project root. Use it as-is.
- After screenshotting, read the PNG from `temporary screenshots/` with the Read tool.
- When comparing, be specific: “heading is 32px but reference shows ~24px”, “card gap is too large”.
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, and layout.

## Output Defaults

- Single `index.html` file, all styles inline, unless user says otherwise.
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`.
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`.
- Mobile-first responsive.

## Brand Assets

- Always check the `brand_assets/` folder before designing. It may contain logos, colors, and other assets.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- If a logo is present, use it. If a color palette is defined, use those exact values.

## Anti-Generic Guardrails

- **Colors:** Never use the default Tailwind palette (`indigo-500`, `blue-600`, etc.). Pick a deliberate palette.
- **Shadows:** Never use flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- **Typography:** Never use the same font for headings and body. Pair a display/serif face with a body face.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via an SVG noise filter.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`.
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states.
- **Images:** Add a gradient overlay (for example, `bg-gradient-to-t from-black/60`) and a color treatment.
- **Spacing:** Use intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** Surfaces should have a layering system (base → elevated → floating), not flat cards.

## Hard Rules

- Do not add sections, features, or content not in the reference.
- Do not “improve” a reference design — match it.
- Do not stop after one screenshot pass.
- Do not use `transition-all`.
- Do not use default Tailwind blue/indigo as the primary color.

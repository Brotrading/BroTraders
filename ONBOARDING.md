# Welcome to propfirmbro.com — Nick's Onboarding

> Hey Nick — welcome to the team. This doc walks you through everything you need to start working on **propfirmbro.com** safely, without breaking the live site. Take 30 minutes to read it once. After that, you'll never need to ask "wait, how do I push this?" again.
>
> If anything is unclear: just message Mike. No stupid questions.

---

## What you're working on

**propfirmbro.com** is a comparison site for prop trading firms — Bro Trading's affiliate funnel. It's a static site (pure HTML, CSS, JavaScript — no backend, no React, no build step). The repo lives on GitHub at:

🔗 **`github.com/Brotrading/BroTraders`**

The site is deployed on **Cloudflare Pages**, which means:
- Every push to a branch automatically gets its own preview URL
- Pushes to `main` go **live to the world**
- Pushes to `dev` go to a staging URL only Mike + you can see

This is important. Read the workflow section carefully.

---

## One-time setup (~10 min)

### 1. Accept the GitHub invite
Mike added you as a collaborator. Check your email or `github.com/notifications` for the invite. Accept it.

### 2. Install the tools you need

**Option A — GitHub Desktop (recommended if you're not super CLI-comfortable)**
- Download: https://desktop.github.com
- Install, sign in with your GitHub account
- Easier visual interface for branches, commits, PRs

**Option B — Git in the terminal (if you prefer command line)**
- Mac: `brew install git` (install Homebrew first if needed)
- Windows: https://git-scm.com/download/win

### 3. Clone the repo

**With GitHub Desktop:**
- File → Clone Repository → URL tab → paste `https://github.com/Brotrading/BroTraders.git` → choose a folder → Clone

**With terminal:**
```bash
cd ~/Documents
git clone https://github.com/Brotrading/BroTraders.git
cd BroTraders
```

### 4. Install a code editor (if you don't have one)

Use **VS Code** — free, works everywhere: https://code.visualstudio.com

Open the cloned `BroTraders` folder in VS Code (`File → Open Folder`).

### 5. Verify the site runs locally

Since it's a static site, you can just open `index.html` in your browser. But for a more realistic preview:

```bash
# In the BroTraders folder:
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. You should see propfirmbro.com running locally.

---

## The Golden Workflow

This is the most important section. Read it twice.

### Two protected branches:
- **`main`** = the live site. Anything merged here goes to **propfirmbro.com** within 30 seconds.
- **`dev`** = the staging branch. Goes to **`dev.propfirmbro.pages.dev`** — only Mike + you see this.

### The rule: **never push directly to `main` or `dev`.**

Always create a new branch off `dev`, do your work, push it, open a Pull Request, get review, merge.

### Step-by-step for any change:

```bash
# 1. Make sure you have the latest dev branch
git checkout dev
git pull origin dev

# 2. Create a new branch for what you're about to do
git checkout -b nick/fix-mobile-header
# Branch name format: nick/short-description-of-the-change
# Use dashes, no spaces, all lowercase

# 3. Do your work — edit files in VS Code

# 4. Save your changes (commit them)
git add .
git commit -m "Fix mobile header overflow on iPhone"

# 5. Push your branch to GitHub
git push origin nick/fix-mobile-header
```

### Then on GitHub:

1. Go to `github.com/Brotrading/BroTraders`
2. You'll see a yellow banner: "**Compare & pull request**" — click it
3. Set base branch to `dev` (NOT `main` — never PR to main directly)
4. Add a clear title + short description of what you changed
5. Click **Create pull request**
6. Mike (or you, if it's a tiny change you're confident about) reviews
7. Once approved → click **Merge**
8. Cloudflare auto-deploys to `dev.propfirmbro.pages.dev` within ~30 seconds

### Going live:

When `dev` looks good and Mike says "ship it":
- Mike creates a PR from `dev` → `main`
- Mike merges → site goes live

**You will not merge to `main` yourself.** That's Mike's job. He's the gatekeeper. This is by design.

---

## Cloudflare's Preview Magic 🪄

Here's the cool part. **Every branch you push automatically gets its own preview URL.**

If you push a branch called `nick/fix-mobile-header`, Cloudflare will auto-deploy it to something like:

`https://nick-fix-mobile-header.brotraders.pages.dev`

You'll see the URL appear as a comment on your Pull Request within 30 seconds. Open it, test on your phone, share it with Mike for visual review.

This means: **you can always test your work live, in a real browser, on your real phone, before anything goes near the actual site.**

---

## Folder Map — What's What

```
BroTraders/
├── index.html              ← The homepage
├── comparison.html         ← The comparison table page
├── propai.html             ← The PropAI chat page (be careful here)
├── giveaway.html           ← Weekly giveaway page
├── *.html                  ← Other angle pages (drawdown, quickfunding, etc.)
├── css/                    ← All styling
├── js/                     ← All JavaScript
├── images/                 ← Logos, screenshots, photos
├── data/
│   ├── firm-rules.json     ← ⚠️ DO NOT EDIT — generated by Mike's scraper
│   └── ...
├── functions/              ← Cloudflare Functions (serverless backend)
│   └── api/
│       └── propai.js       ← ⚠️ DO NOT EDIT — Claude API integration
├── robots.txt
└── sitemap.xml
```

---

## What's Safe to Edit ✅

- Any `.html` file (text, structure, layout) — but **always check on mobile** before merging
- Any `.css` file — styling, colors, spacing
- Any `.js` file in `/js/` — frontend behavior, animations, table sorting
- Files in `/images/` — replacing or adding images
- `robots.txt`, `sitemap.xml` — but tell Mike before changing these (SEO impact)

## What NOT to Touch ❌

These are auto-generated, security-sensitive, or owned by Mike's tooling:

- **`data/firm-rules.json`** — generated by Mike's prop firm scraper. If you edit this manually, the next scraper run will overwrite your work and you'll get blamed for "breaking the data." Don't.
- **`functions/api/propai.js`** — Cloudflare Function that talks to the Claude API. Has secret keys involved. Mike owns this.
- **`.env` files** (if any) — contain API keys
- **`affiliate links`** anywhere on the site — these are Mike's revenue. If you find a typo in a link, **flag it to Mike, don't fix it yourself**.

If you're not sure whether something is safe to touch: **ask Mike first.** Always.

---

## Common Tasks Cookbook

### "I want to fix a typo on the homepage"
```bash
git checkout dev && git pull
git checkout -b nick/fix-homepage-typo
# Edit index.html in VS Code
git add . && git commit -m "Fix typo in hero section"
git push origin nick/fix-homepage-typo
# Open PR to dev on GitHub
```

### "I want to update the styling of the comparison table"
Same flow as above, but edit files in `/css/`. Test on `dev.propfirmbro.pages.dev` after merging.

### "I want to add a new prop firm row"
**Don't.** Mike's scraper handles firm data via `data/firm-rules.json`. Tell Mike "I think we should add firm X" and he'll trigger the scraper.

### "I want to add a brand new page"
Talk to Mike first. New pages affect navigation, sitemap, SEO — needs coordination.

### "I broke something and the preview looks wrong"
- Don't panic
- Don't merge the PR
- Drop a message to Mike with the preview URL, and we'll figure it out together
- You can always discard your branch and start over: `git checkout dev && git branch -D nick/your-branch`

---

## Branch Naming Convention

Format: `nick/short-description`

Good examples:
- `nick/fix-mobile-nav`
- `nick/update-hero-copy`
- `nick/redesign-footer`

Bad examples:
- `test` ← too vague
- `Nick Branch 2` ← spaces, no description
- `fix` ← what fix?

The `nick/` prefix makes it instantly clear who owns the branch.

---

## Commit Message Convention

Format: short imperative sentence, no period.

Good:
- `Fix mobile header overflow on iPhone`
- `Update hero copy for May campaign`
- `Add YRM logo to firms grid`

Bad:
- `update` ← too vague
- `fixed the bug i was working on yesterday lol` ← unclear
- `WIP` ← don't commit work-in-progress to a PR branch

---

## When Things Go Wrong

### "I have a merge conflict"
GitHub will show "This branch has conflicts." Click "Resolve conflicts" in the browser, or:
```bash
git checkout dev && git pull
git checkout your-branch
git merge dev
# Fix conflicts in VS Code (it highlights them)
git add . && git commit -m "Resolve merge conflicts with dev"
git push
```
If you're stuck → message Mike.

### "I committed to the wrong branch"
Stop. Don't push. Message Mike. Recovering is easy as long as you haven't pushed yet.

### "I accidentally pushed to dev directly"
GitHub branch protection should prevent this — but if it happens, message Mike immediately. We can revert.

### "Cloudflare preview shows old version"
Wait 60 seconds and hard-refresh (Cmd+Shift+R / Ctrl+Shift+R). Cloudflare's CDN can take a moment.

---

## Communication

- **Quick questions / "is this OK to edit?"** → Discord DM Mike
- **PR review requests** → tag Mike in the PR comments
- **"I think we should change X strategy"** → call Mike, don't go it alone

---

## TL;DR — The 5 Rules

1. **Never push to `main` or `dev` directly.** Always work on a `nick/` branch.
2. **Always PR to `dev`, never to `main`.** Mike handles `main`.
3. **Don't touch `data/firm-rules.json` or `functions/api/propai.js`.**
4. **Use the Cloudflare preview URL to test every change before merging.**
5. **When in doubt, ask Mike.**

Welcome aboard 🤝

— Mike + Bro Trading

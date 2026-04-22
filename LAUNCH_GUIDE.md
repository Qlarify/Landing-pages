# Qlarify Health — Landing Page Launch Guide

This is the end-to-end process for taking your 6 landing pages live at `videoaudit.qlarify.health` using GitHub + Cloudflare Pages.

Total time: ~90 minutes the first time. Every future edit becomes a 30-second `git push`.

---

## Stack decisions

| Choice | What I picked | Why |
|---|---|---|
| Domain | `videoaudit.qlarify.health` (subdomain) | SEO inherits from root, brand trust, safe to iterate |
| Host | Cloudflare Pages | Free, unlimited bandwidth (your videos need this), global CDN, auto-SSL |
| Repo | GitHub (private) | Free, auto-deploys on push, free rollbacks |
| Analytics | GA4 + LinkedIn Insight Tag | Traffic intel + B2B retargeting for hospitals |

---

## Phase 1 — Pre-launch hygiene (30 min)

Do these before deploy. They're small but each one costs you conversions if skipped.

### 1.1 Optimize video file sizes
Your `.webm` files are already good, but check each is under 3 MB. If larger, re-encode with Handbrake (free):
- Preset: `Web > Gmail Medium 5 Minutes 720p30`
- Format: WebM
- Video codec: VP9 quality 32

Big videos = slow page = bounced bookings. Target LCP (largest contentful paint) < 2.5s.

### 1.2 Add favicon + social share image
Create a `/favicon.ico` (32x32) and `/og-image.jpg` (1200x630) using your Q-mark on brand colors. Reference them in the `<head>` of all 6 pages:

```html
<link rel="icon" href="/favicon.ico">
<meta property="og:title" content="Video as Infrastructure for Healthcare | Qlarify">
<meta property="og:description" content="Turn every patient question into a video that answers 100 more.">
<meta property="og:image" content="https://videoaudit.qlarify.health/og-image.jpg">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

### 1.3 Add a 404 page
Create `404.html` in the folder — any prospect who mistypes a URL currently gets a generic error. Even a one-line "Page not found — take me home" with a Calendly link recovers some of those.

### 1.4 Robots + sitemap
Create `robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://videoaudit.qlarify.health/sitemap.xml
```

Create `sitemap.xml` with all 6 pages. Google will index faster.

### 1.5 Verify every Calendly link works
Open each of the 6 pages in a browser and click every "Book a discovery call" button. They should all land on `https://calendly.com/qlarify-marketing/30min`. You already have this wired — just sanity-check.

---

## Phase 2 — Get your domain sorted (15 min)

### If you already own qlarify.health
Skip to Phase 3. You'll add the subdomain DNS record later.

### If you don't own it yet
Buy at **Cloudflare Registrar** (at-cost pricing, free WHOIS privacy) or Namecheap. `.health` domains run ~₹1,200–2,500/year.

After purchase:
1. In your registrar, set nameservers to Cloudflare's (you'll get these when you add the site to Cloudflare in Phase 4). This gives you DNS control + DDoS protection + analytics, all free.
2. Wait 15 min to a few hours for nameserver propagation.

---

## Phase 3 — Push to GitHub (20 min)

### 3.1 Install tooling (one-time)
- [Install Git](https://git-scm.com/downloads)
- [Sign up for GitHub](https://github.com/signup) (free)
- [Install GitHub Desktop](https://desktop.github.com) — gives you a visual git UI so you never touch terminal if you don't want to

### 3.2 Create the repo
1. Open GitHub in browser → **New repository**
2. Name: `qlarify-landing-pages`
3. Visibility: **Private** (these are your business pages — no reason to expose)
4. Do NOT initialize with README
5. Click **Create repository**

### 3.3 Push your files
1. Open GitHub Desktop → **File → Add local repository** → select the `Landing pages` folder
2. It'll prompt "This directory isn't a repository. Create one?" → yes
3. Commit message: `initial landing pages` → **Commit to main**
4. Click **Publish repository** → select the `qlarify-landing-pages` repo you just created → uncheck "Keep this code private" only if you want it public (leave it private)

Your code is now on GitHub.

---

## Phase 4 — Deploy on Cloudflare Pages (15 min)

### 4.1 Add your domain to Cloudflare (if not already)
1. Sign up at [cloudflare.com](https://www.cloudflare.com)
2. **Add a site** → enter `qlarify.health` → Free plan
3. Cloudflare scans existing DNS. Confirm the records it imports.
4. Cloudflare gives you 2 nameservers → go to your registrar and replace existing nameservers with these.
5. Wait for "Active" status (minutes to hours).

### 4.2 Create the Pages project
1. In Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorize Cloudflare to access your GitHub account
3. Select the `qlarify-landing-pages` repo
4. Project name: `qlarify-landing-pages`
5. Production branch: `main`
6. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/` (or leave empty)
7. **Save and Deploy**

~1 minute later you'll have a live URL like `qlarify-landing-pages.pages.dev`. Open it — your flagship should render.

### 4.3 Wire up the custom domain
1. In the Pages project → **Custom domains** → **Set up a custom domain**
2. Enter `videoaudit.qlarify.health`
3. Cloudflare auto-creates the CNAME record since your DNS is already with them
4. Wait 30 seconds. Now `https://videoaudit.qlarify.health` → your flagship

For specialty pages, they live at:
- `videoaudit.qlarify.health/ivf.html`
- `videoaudit.qlarify.health/oncology.html`
- `videoaudit.qlarify.health/cardiology.html`
- `videoaudit.qlarify.health/dermatology.html`
- `videoaudit.qlarify.health/dental.html`

If you want cleaner URLs (`/ivf` without `.html`), add a `_redirects` file to the repo root:
```
/ivf         /ivf.html         200
/oncology    /oncology.html    200
/cardiology  /cardiology.html  200
/dermatology /dermatology.html 200
/dental      /dental.html      200
```

---

## Phase 5 — Add tracking (15 min)

### 5.1 Google Analytics 4
1. Go to [analytics.google.com](https://analytics.google.com) → create account → create property "Qlarify Landing Pages"
2. Get your Measurement ID (format: `G-XXXXXXXXXX`)
3. Add this snippet inside `<head>` on every page, just before `</head>`:

```html
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

Track Calendly clicks as conversions — add this right before `</body>` on every page:

```html
<script>
  document.querySelectorAll('a[href*="calendly.com"]').forEach(a => {
    a.addEventListener('click', () => {
      if (window.gtag) gtag('event', 'book_discovery_call', { page: document.title });
    });
  });
</script>
```

### 5.2 LinkedIn Insight Tag
1. [linkedin.com/campaignmanager](https://www.linkedin.com/campaignmanager/) → Account assets → Insight Tag → Install my Insight Tag
2. Get your Partner ID (6-digit number)
3. Add this snippet before `</body>` on every page:

```html
<script type="text/javascript">
_linkedin_partner_id = "YOUR_PARTNER_ID";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/javascript">
(function(l) { if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
window.lintrk.q=[]} var s = document.getElementsByTagName("script")[0];
var b = document.createElement("script"); b.type = "text/javascript";b.async = true;
b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b, s);})(window.lintrk);
</script>
```

### 5.3 The clean way to add tracking
Rather than hand-editing 6 files, add the analytics snippets to `build_specialty_pages.py` (inside the template) so the generator handles them, then manually add to `index.html` once. Push to GitHub → Cloudflare auto-rebuilds.

---

## Phase 6 — Day-1 launch checklist

Before sharing the URL with anyone:

- [ ] Every page loads in under 3 seconds on 4G (test at [pagespeed.web.dev](https://pagespeed.web.dev))
- [ ] All 5 videos play on each specialty page
- [ ] Carousel prev/next/dots all work
- [ ] Sticky CTA appears after scroll
- [ ] Every Calendly link opens the right booking page
- [ ] Favicon + social preview show correctly (test with [opengraph.xyz](https://www.opengraph.xyz))
- [ ] GA4 real-time shows your visit when you open the page
- [ ] Mobile layout looks right (test on your phone, not just a browser resize)
- [ ] HTTPS lock shows in the browser (Cloudflare handles this free)
- [ ] `/ivf`, `/oncology` etc. all redirect cleanly

---

## Phase 7 — Ongoing workflow

Future edits:
1. Open the repo folder in VS Code (or any editor)
2. Make your change (or have Claude make it)
3. GitHub Desktop → Commit → Push
4. Cloudflare rebuilds and deploys in ~60 seconds
5. Old versions stay accessible via Cloudflare's deployment history — rollback in one click if something breaks

---

## Costs (yearly, rupee-equivalent)

| Item | Cost |
|---|---|
| Domain qlarify.health | ~₹1,500–2,500 |
| Cloudflare Pages | ₹0 (free tier covers everything here) |
| GitHub private repo | ₹0 |
| Google Analytics | ₹0 |
| LinkedIn Insight Tag | ₹0 |
| **Total** | **~₹2,000/year** |

---

## When you're ready to scale

- **Add a form on top of Calendly**: Use [Formspree](https://formspree.io) free tier to capture leads who aren't ready to book a call — sends to your email, no backend needed.
- **A/B test headlines**: Cloudflare has a free A/B testing tool called Rules → Redirect Rules.
- **Add a blog**: Consider moving to Astro or Eleventy for a proper CMS feel without losing the current aesthetic.

---

## Common gotchas

- **Videos won't play on iOS Safari** → already handled (your videos have `playsinline` attribute via the click-to-play script). Verify on an actual iPhone.
- **DNS takes longer than expected** → up to 48 hours in worst case, usually minutes. Use [dnschecker.org](https://dnschecker.org) to watch propagation.
- **Cloudflare cache stuck on old version** → Cloudflare dashboard → Caching → Purge Everything.
- **Calendly iframe blocked on some networks** → your current setup opens Calendly in a new tab, which dodges this entirely. Good.

---

*Guide built for a 6-page static site with ~15 MB of video assets. Revisit if the site architecture changes significantly.*

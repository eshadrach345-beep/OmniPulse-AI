# SEO and getting found

## What the code already does
- Page title, description, canonical link, Open Graph and Twitter share cards (with a 1200x630 image)
- Structured data (Organization, WebSite, SoftwareApplication with prices, FAQPage)
- Crawlable text inside index.html, so search engines see real content before JavaScript runs
- robots.txt and sitemap.xml, real URLs for /terms /privacy /refunds, web manifest and icons
- /api/ is kept out of search results

## If you change your domain
Search and replace `https://omnipulseai.us.ci` with the new address in: index.html, public/robots.txt, public/sitemap.xml.

## Things only you can do (in this order)
1. Buy a real domain (a .com is about $10 a year) and use it instead of omnipulseai.us.ci. Free subdomains rank poorly, are hard to verify, and TikTok/Meta reviews often reject them.
2. Google Search Console (search.google.com/search-console): add the site, verify it, submit /sitemap.xml, then use URL Inspection on the home page and press Request indexing.
3. Bing Webmaster Tools (bing.com/webmasters): import from Search Console.
4. Create profiles named OmniPulse AI on X, TikTok, Instagram, YouTube and LinkedIn and link each one to the site.
5. Post every day. Use your own product to make videos about your niche and put the link in your bio.
6. Get links: Product Hunt, BetaList, Indie Hackers, relevant subreddits (read each one's self-promotion rules), AI tool directories.
7. Write helpful pages people search for, such as "how to schedule TikTok posts" or "best hashtags for fitness". One good page a week beats ten thin ones.

## The blog
- Six articles live at /blog and /blog/<slug>. They are plain static pages in `public/blog`, so search engines read them instantly.
- To add a post: add an entry to `ARTICLES` in `scripts/build-blog.py`, run `python3 scripts/build-blog.py`, and commit the new files in `public/blog` (the sitemap updates itself).
- Aim for one useful post a week. After publishing, open Google Search Console, paste the new address into URL Inspection and press Request indexing.
- Do not copy articles from other sites or use fake statistics. Google ignores thin or copied pages.

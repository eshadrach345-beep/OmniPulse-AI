#!/usr/bin/env python3
"""
Generates the blog as plain static HTML in public/blog (crawlable, fast, no JavaScript needed).
Add a post by adding an entry to ARTICLES below, then run:  python3 scripts/build-blog.py
Vercel serves the generated files as-is, so commit public/blog afterwards.
"""
import json, html, os, re

SITE = 'https://omnipulseai.us.ci'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'blog')
SITEMAP = os.path.join(os.path.dirname(__file__), '..', 'public', 'sitemap.xml')

ARTICLES = [
 {
  'slug': 'how-to-find-trending-topics-in-your-niche',
  'title': 'How to Find Trending Topics in Your Niche Before Everyone Else',
  'desc': 'A practical method for spotting what your audience is about to care about, checking that it is real, and turning it into a video while it is still fresh.',
  'date': '2026-10-23', 'read': '5 min read',
  'body': '''
<p>Most creators find out about a trend when it is already everywhere. By then, the people who spotted it early have collected the views, and you are one of a thousand accounts making the same video. The fix is not luck. It is a short routine you can run every week.</p>

<h2>Start with where trends show up first</h2>
<p>Trends rarely begin on the biggest accounts. They show up in smaller places first, so check these:</p>
<ul>
<li><strong>Search suggestions.</strong> Type the start of a phrase in TikTok, YouTube and Instagram search. What the platform suggests is what people are looking for right now.</li>
<li><strong>Google Trends.</strong> Search your niche keyword and look at the “rising” related queries. A query that is climbing fast is a better target than one that is already huge.</li>
<li><strong>Comment sections.</strong> Open the three most recent posts from the biggest creators in your niche. Repeated questions in the comments are topics nobody has answered well yet.</li>
<li><strong>Newsletters and news in your field.</strong> A new product, rule change or event is a reason for people to search and watch this week.</li>
</ul>

<h2>Check that the trend is real and recent</h2>
<p>Before you build a video around something, run three quick checks:</p>
<ol>
<li><strong>Recency.</strong> Sort results by newest. If the top posts are from months ago, the moment has passed.</li>
<li><strong>Spread.</strong> Is it showing up from several unrelated accounts, or only one? One account is a post, not a trend.</li>
<li><strong>Room for a new angle.</strong> If fifty people have made the same video, you need a different take: a counter-opinion, a beginner version, a mistake to avoid, or a result from your own experience.</li>
</ol>

<h2>Turn it into a video quickly</h2>
<p>Speed matters more than polish. Write one clear hook, three to five short points, and one call to action. If you can publish within a day or two of spotting the topic, you are early. If it takes two weeks, you are probably late.</p>

<h2>Keep a simple topic log</h2>
<p>Write down every topic you spot, the date, and where you saw it. After a month you will notice which sources give you the earliest signals for your niche. Drop the ones that are always late.</p>

<h2>Let software do the legwork</h2>
<p>Doing all of this by hand takes hours. OmniPulse runs live web research on your niche and returns trending topics, hashtags and creators who are gaining ground, along with hooks you can adapt. You still decide which ones fit your voice. The tool just removes the searching.</p>
'''
 },
 {
  'slug': 'how-to-find-hashtags-that-work',
  'title': 'How to Find Hashtags That Actually Work (and Which to Skip)',
  'desc': 'Stop copying giant hashtag lists. Learn how to mix broad, niche and evergreen hashtags, check them properly and track what brings viewers.',
  'date': '2026-10-23', 'read': '5 min read',
  'body': '''
<p>Pasting thirty popular hashtags under every post does not work. The biggest hashtags move so fast that your post disappears in seconds, and platforms increasingly rely on your caption, audio and video content to decide who should see it. Hashtags still help, but only when they are chosen with care.</p>

<h2>Use three kinds of hashtags</h2>
<p>A balanced set usually includes one or two from each group:</p>
<ul>
<li><strong>Broad and viral.</strong> Large tags with lots of traffic. They give you a small chance at a big audience.</li>
<li><strong>Niche-specific.</strong> Tags used by people who care about exactly your topic. These bring the viewers most likely to follow you.</li>
<li><strong>Evergreen.</strong> Tags that stay useful all year, such as the name of your craft or product type.</li>
</ul>
<p>A handful of well-chosen tags (three to five is a sensible starting point) usually beats a long list. Test and see what your own results say.</p>

<h2>How to check a hashtag before you use it</h2>
<ol>
<li><strong>Open its results page.</strong> Do the top posts match your topic? If the tag is full of unrelated content, skip it.</li>
<li><strong>Look at the dates.</strong> If the newest posts are weeks old, nobody is browsing it.</li>
<li><strong>Look at the quality.</strong> If every post is spam, your post will be grouped with spam.</li>
<li><strong>Check that it is allowed.</strong> Some tags are restricted or hidden by platforms. If a tag shows few or no results, avoid it.</li>
</ol>

<h2>Put keywords in your caption too</h2>
<p>People search by typing words, not only by tapping hashtags. Say what your video is about in plain language in the first line of the caption and, if you speak in the video, say the key phrase out loud. Search on social platforms reads all of it.</p>

<h2>Track what works</h2>
<p>For two weeks, record the hashtags you used on each post and the views it got in the first day. Look for tags that keep showing up on your better posts. Keep those, drop the rest, and try new ones in their place.</p>

<h2>Skip the guesswork</h2>
<p>OmniPulse’s hashtag radar groups tags into viral, niche-specific and evergreen sets for your niche from live research, so you can start from a sensible mix instead of a blank page. Treat its suggestions as a starting point and keep testing against your own results.</p>
'''
 },
 {
  'slug': 'how-to-schedule-social-media-posts',
  'title': 'How to Schedule Social Media Posts Without Losing Your Mind',
  'desc': 'A simple weekly batching routine for planning, writing and scheduling posts across TikTok, YouTube, Instagram and more.',
  'date': '2026-10-23', 'read': '5 min read',
  'body': '''
<p>Posting live, every day, on several platforms is a fast way to burn out. Scheduling lets you create in one sitting and publish across the week. Here is a routine that works for solo creators and small teams.</p>

<h2>1. Pick fewer platforms</h2>
<p>Two or three is enough. Choose the platforms where your audience already spends time, and do those well before adding more. Posting on seven networks badly is worse than posting on two with care.</p>

<h2>2. Batch your creation</h2>
<p>Choose one block of time each week for making content. Record or generate several videos in a row, write captions while the ideas are fresh, and prepare thumbnails. Switching between creating and posting wastes time, so separate them.</p>

<h2>3. Choose posting times from your own data</h2>
<p>Articles that claim a single “best time to post” for everyone are guessing. Your audience is unique. Look at your analytics for when your followers are online, start with those windows, and adjust after a few weeks of results.</p>

<h2>4. Adjust the caption for each platform</h2>
<p>The same video can go everywhere, but the caption should not always be identical. A short punchy line suits TikTok, a slightly longer explanation can work on YouTube Shorts, and LinkedIn readers usually expect a more professional tone. Small changes make posts feel native.</p>

<h2>5. Leave space for what is happening now</h2>
<p>If you schedule every slot a month ahead, you cannot react to news or a trend. Fill about three quarters of your calendar and keep the rest open for timely posts.</p>

<h2>6. Check in daily, even briefly</h2>
<p>Scheduling does not replace being present. Spend a few minutes each day replying to comments. Early replies often help a post, and they build the relationship with your audience that makes people follow.</p>

<h2>Common mistakes</h2>
<ul>
<li>Scheduling content about events that may change before it posts.</li>
<li>Forgetting to reconnect an account when a platform logs you out.</li>
<li>Never reviewing results. If you do not look, you cannot improve.</li>
</ul>

<h2>Using a scheduler</h2>
<p>OmniPulse has a post scheduler where you queue posts once and publish to every channel you have connected. A post that fails on one platform is flagged so you can fix it rather than finding out days later.</p>
'''
 },
 {
  'slug': 'ai-video-for-social-media-beginners-guide',
  'title': 'AI Video for Social Media: A Beginner’s Guide to Making Short Videos',
  'desc': 'How to go from an idea to a finished short video with AI: hook, script, visuals, voice-over, captions and the mistakes to avoid.',
  'date': '2026-10-23', 'read': '6 min read',
  'body': '''
<p>AI video tools can turn a written idea into a short clip with narration in minutes. They are useful, but they work best when you give them a clear plan. This guide covers a simple workflow and the limits you should know about.</p>

<h2>Step 1: Start with one idea and one audience</h2>
<p>Write one sentence: “This video helps [who] to [do what].” If you cannot finish that sentence, the video is not ready. A vague idea gives a vague video, whether a human or an AI makes it.</p>

<h2>Step 2: Write the hook first</h2>
<p>The first two seconds decide whether people keep watching. Good hooks make a promise (“Three mistakes that ruin your photos”), ask a question, or challenge a common belief. Write three versions and pick the strongest.</p>

<h2>Step 3: Keep the script short</h2>
<p>People speak at roughly 150 words per minute, so a 30-second video is about 75 words. Write a hook, two or three points and one call to action. Read it aloud. If you run out of breath, cut words.</p>

<h2>Step 4: Describe visuals in simple terms</h2>
<p>AI video models generate short clips, often only a few seconds each, so plan scenes of a few seconds rather than one long take. Describe the subject, the setting, the lighting and the camera movement in plain language. Avoid asking for readable text inside the clip, since generated text is often unreliable. Add captions afterwards instead.</p>

<h2>Step 5: Add a natural voice-over</h2>
<p>A clear narration carries most of the message. Pick a voice that matches your brand and keep the pace steady. Listen to the whole thing once before you publish and fix any word that sounds wrong.</p>

<h2>Step 6: Be open about AI content</h2>
<p>Major platforms have rules about labelling AI-generated or altered content, especially when it looks realistic. Read the current policy for each platform you post to and use the labelling option when it applies. Do not depict real people saying things they did not say.</p>

<h2>Common mistakes</h2>
<ul>
<li>Trying to say too much. One video, one idea.</li>
<li>Skipping the review. Always watch the final video before posting.</li>
<li>Posting once and giving up. Your tenth video will be much better than your first.</li>
</ul>

<h2>Where OmniPulse fits</h2>
<p>OmniPulse writes the script and scene plan, generates the clip and voice-over, and lets you schedule the result, all in one place. Video quality depends on your plan, from Standard (480p) to Full HD (1080p, AI-enhanced). You stay in control of the idea and the final decision to publish.</p>
'''
 },
 {
  'slug': 'ab-test-video-hooks',
  'title': 'How to A/B Test Your Video Hooks (and Know When You Have a Real Winner)',
  'desc': 'Learn a simple way to test two opening hooks, what to measure, and how to avoid declaring a winner from tiny differences.',
  'date': '2026-10-23', 'read': '5 min read',
  'body': '''
<p>The opening seconds of a video do more work than the rest of it. If you want to improve results, testing your hooks is one of the most reliable places to start. The trick is to test properly so you learn something true.</p>

<h2>What an A/B test is</h2>
<p>You make two versions of the same post that differ in one thing only, publish both under similar conditions, and compare the results. For hooks, version A and version B share the same video and caption but start with different opening lines.</p>

<h2>Change one thing at a time</h2>
<p>If you change the hook, the thumbnail and the caption together, you will not know which change mattered. Keep everything else identical. If you want to test the thumbnail next, do it in a separate test.</p>

<h2>Keep the conditions fair</h2>
<ul>
<li>Post at similar times of day, on the same account or similar accounts.</li>
<li>Do not boost one version with ads and not the other.</li>
<li>Give both versions the same amount of time before you compare them.</li>
</ul>

<h2>Choose the right measure</h2>
<p>Raw views can be misleading. Better signals are how many people watch past the first few seconds, average watch time, and the share of viewers who like, comment or share. Pick one main measure before you start so you are not tempted to choose whichever number looks best afterwards.</p>

<h2>Do not trust small differences</h2>
<p>If version A got 1,020 views and version B got 980, that is noise, not a winner. The smaller the audience and the closer the numbers, the more likely the gap is just chance. Run the test again, or wait for more data. A clear and repeated gap across several tests is what counts.</p>

<h2>Write down what you learn</h2>
<p>Keep a simple log: the two hooks, the measure, the result and what you think it means. After ten tests you will see patterns, such as question hooks beating statement hooks for your audience. Reuse what wins.</p>

<h2>Hook ideas to test</h2>
<ul>
<li>A question versus a bold statement.</li>
<li>Starting with the result versus starting with the problem.</li>
<li>A number (“3 mistakes”) versus no number.</li>
<li>A direct address (“If you sell online…”) versus a general opening.</li>
</ul>

<h2>Testing inside OmniPulse</h2>
<p>OmniPulse’s A/B Studio helps you create two hook variants, track them side by side and checks whether the difference is big enough to trust before it names a winner.</p>
'''
 },
 {
  'slug': 'content-calendar-for-short-videos',
  'title': 'How to Build a 4-Week Content Calendar for Short Videos',
  'desc': 'A realistic planning method with content pillars, a sustainable posting rhythm and a weekly review so you never stare at a blank page.',
  'date': '2026-10-23', 'read': '5 min read',
  'body': '''
<p>A content calendar is not about posting more. It is about removing the daily question of “what do I post today?” so you can spend your energy making good videos. This four-week plan is simple enough to start this week.</p>

<h2>Step 1: Choose three or four content pillars</h2>
<p>Pillars are the repeating themes your channel is about. A fitness creator might use workouts, nutrition, mindset and gear reviews. Having pillars means you always know what kind of video fits, and your audience knows what to expect from you.</p>

<h2>Step 2: Decide a rhythm you can keep</h2>
<p>Consistency beats intensity. Three to five posts a week that you can sustain for months are better than a daily schedule you abandon after two weeks. Be honest about how much time you have.</p>

<h2>Step 3: Map the month</h2>
<ol>
<li><strong>Week 1:</strong> foundations. Videos that explain who you help and your best-known tips.</li>
<li><strong>Week 2:</strong> problem solving. Answer the questions people ask you most.</li>
<li><strong>Week 3:</strong> proof. Results, examples, behind-the-scenes and stories.</li>
<li><strong>Week 4:</strong> engagement. Opinions, polls, reactions and a recap of the month.</li>
</ol>
<p>Rotate your pillars through each week so no single theme dominates.</p>

<h2>Step 4: Reserve a trend slot</h2>
<p>Leave at least one slot a week for something timely. When a topic is moving in your niche, you can use that slot immediately instead of rearranging everything.</p>

<h2>Step 5: Batch the work</h2>
<p>Pick one day a week for creating. Write scripts for the week, generate or record the videos, add captions and schedule them. When posting day arrives there is nothing left to do except reply to comments.</p>

<h2>Step 6: Reuse each video</h2>
<p>One idea can become a short video on several platforms, a text post, a carousel and a newsletter paragraph. Change the caption and format, not the core idea.</p>

<h2>Step 7: Review every week</h2>
<p>Every Sunday, look at your top two and bottom two posts. Ask what the best ones had in common: the topic, the hook, the length, the posting time. Do more of that next week.</p>

<h2>A simple template</h2>
<p>Write the days across the top of a page and your pillars down the side. Fill each slot with a one-line idea and the hook you will use. That page is your calendar. It takes about thirty minutes and removes weeks of second-guessing.</p>

<h2>Let the tool fill the gaps</h2>
<p>If you get stuck, OmniPulse’s trend research suggests topics and hooks for your niche, and its scheduler lets you line everything up in one calendar across your connected channels.</p>
'''
 },
]

CSS = '''
:root{--bg:#08111a;--panel:#0f1a27;--line:#1a2a3b;--text:#d3dee8;--muted:#8aa2b8;--head:#fff;--accent:#3cc4b5;--btn:#0a8a7e}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Figtree',system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.75;font-size:1.0625rem}
a{color:var(--accent)}a:hover{color:#74dccf}
header.top{border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(8,17,26,.9);backdrop-filter:blur(8px);z-index:5}
.bar{max-width:60rem;margin:0 auto;padding:0 1.25rem;height:4rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.brand{display:flex;align-items:center;gap:.6rem;text-decoration:none;color:var(--head);font-family:'Bricolage Grotesque','Figtree',sans-serif;font-weight:700;font-size:1.15rem}
.mark{width:2rem;height:2rem;border-radius:.55rem;background:var(--btn);display:inline-flex;align-items:center;justify-content:center}
.btn{background:var(--btn);color:#fff!important;text-decoration:none;padding:.6rem 1rem;border-radius:.6rem;font-weight:600;font-size:.9rem;white-space:nowrap}
.btn:hover{background:#14a899}
nav.links{display:flex;align-items:center;gap:1.1rem;font-size:.95rem}nav.links a.l{color:var(--text);text-decoration:none}nav.links a.l:hover{color:#fff}
main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem 3rem}
.wide{max-width:60rem}
h1,h2{font-family:'Bricolage Grotesque','Figtree',sans-serif;color:var(--head);letter-spacing:-.015em;line-height:1.15}
h1{font-size:clamp(2rem,6vw,3rem);margin:.4rem 0 1rem;font-weight:800}
h2{font-size:1.6rem;margin:2.4rem 0 .6rem}
.meta{color:var(--muted);font-size:.9rem}
.crumbs{font-size:.9rem;color:var(--muted)}.crumbs a{color:var(--muted)}
ul,ol{padding-left:1.4rem}li{margin:.4rem 0}
.cta{margin:3rem 0 1rem;padding:1.5rem;border:1px solid var(--line);background:var(--panel);border-radius:1rem}
.cta h2{margin-top:0;font-size:1.35rem}
.related{margin-top:2.5rem;border-top:1px solid var(--line);padding-top:1.25rem}.related h2{font-size:1.2rem;margin-top:0}
.posts{list-style:none;padding:0;margin:2rem 0}.posts li{border-top:1px solid var(--line);padding:1.4rem 0;margin:0}
.posts a.t{font-family:'Bricolage Grotesque','Figtree',sans-serif;font-size:1.45rem;font-weight:700;color:var(--head);text-decoration:none;line-height:1.2}
.posts a.t:hover{color:var(--accent)}.posts p{margin:.4rem 0 .3rem;color:var(--text)}
footer{border-top:1px solid var(--line);padding:2rem 1.25rem;text-align:center;color:var(--muted);font-size:.85rem}footer a{color:var(--muted)}
'''

def esc(s): return html.escape(s, quote=True)

def head(title, desc, path, extra_ld, og_type='article'):
    url = SITE + path
    ld = '\n'.join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False) + '</script>' for x in extra_ld)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#08111a">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="OmniPulse AI">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{SITE}/og-image.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;800&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}</style>
{ld}
</head>
<body>
<header class="top"><div class="bar">
<a class="brand" href="/"><span class="mark"><svg width="16" height="16" viewBox="0 0 64 64" aria-hidden="true"><path d="M36 8 16 36h14l-4 20 22-30H34z" fill="#fff"/></svg></span>OmniPulse AI</a>
<nav class="links"><a class="l" href="/blog">Blog</a><a class="btn" href="/">Open the studio</a></nav>
</div></header>
'''

def foot():
    return '''<footer>
<p>© 2026 OmniPulse AI · <a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a></p>
</footer>
</body>
</html>
'''

def fmt_date(d):
    y, m, dd = d.split('-')
    months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    return f'{months[int(m)-1]} {int(dd)}, {y}'

def build():
    os.makedirs(OUT, exist_ok=True)
    for a in ARTICLES:
        path = f"/blog/{a['slug']}"
        others = [x for x in ARTICLES if x['slug'] != a['slug']][:3]
        related = ''.join(f'<li><a href="/blog/{x["slug"]}">{esc(x["title"])}</a></li>' for x in others)
        ld = [
          {"@context":"https://schema.org","@type":"Article","headline":a['title'],"description":a['desc'],"datePublished":a['date'],"dateModified":a['date'],
           "image":SITE+"/og-image.png","mainEntityOfPage":SITE+path,
           "author":{"@type":"Organization","name":"OmniPulse AI","url":SITE+"/"},
           "publisher":{"@type":"Organization","name":"OmniPulse AI","logo":{"@type":"ImageObject","url":SITE+"/icon-512.png"}}},
          {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
            {"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},
            {"@type":"ListItem","position":2,"name":"Blog","item":SITE+"/blog"},
            {"@type":"ListItem","position":3,"name":a['title'],"item":SITE+path}]},
        ]
        page = head(a['title'] + ' | OmniPulse AI', a['desc'], path, ld) + f'''<main>
<p class="crumbs"><a href="/">Home</a> / <a href="/blog">Blog</a></p>
<article>
<h1>{esc(a['title'])}</h1>
<p class="meta">{fmt_date(a['date'])} · {a['read']}</p>
{a['body']}
</article>
<section class="cta">
<h2>Research it, make it, post it</h2>
<p>OmniPulse researches your niche live, creates short videos with a voice-over, and schedules them to the channels you connect.</p>
<p><a class="btn" href="/">Try OmniPulse</a></p>
</section>
<section class="related"><h2>Keep reading</h2><ul>{related}</ul></section>
</main>
''' + foot()
        with open(os.path.join(OUT, a['slug'] + '.html'), 'w', encoding='utf-8') as f: f.write(page)

    items = ''.join(f'''<li><a class="t" href="/blog/{a["slug"]}">{esc(a["title"])}</a><p>{esc(a["desc"])}</p><span class="meta">{fmt_date(a["date"])} · {a["read"]}</span></li>''' for a in ARTICLES)
    ld = [{"@context":"https://schema.org","@type":"Blog","name":"OmniPulse AI Blog","url":SITE+"/blog",
           "blogPost":[{"@type":"BlogPosting","headline":a['title'],"url":SITE+"/blog/"+a['slug'],"datePublished":a['date']} for a in ARTICLES]}]
    idx = head('Blog: Social Media Growth, AI Video and Scheduling | OmniPulse AI',
               'Practical guides on finding trends, choosing hashtags, scheduling posts, making AI videos and testing hooks for TikTok, YouTube and Instagram.',
               '/blog', ld, 'website') + f'''<main class="wide">
<h1>The OmniPulse blog</h1>
<p>Practical, no-fluff guides for creators and small teams: finding trends, making short videos with AI, scheduling and testing what works.</p>
<ul class="posts">{items}</ul>
</main>
''' + foot()
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as f: f.write(idx)

    # sitemap: keep non-blog URLs, regenerate blog URLs
    s = open(SITEMAP, encoding='utf-8').read()
    s = re.sub(r'\s*<url><loc>' + re.escape(SITE) + r'/blog[^<]*</loc>.*?</url>', '', s)
    add = f'\n  <url><loc>{SITE}/blog</loc><lastmod>2026-10-23</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>'
    for a in ARTICLES:
        add += f'\n  <url><loc>{SITE}/blog/{a["slug"]}</loc><lastmod>{a["date"]}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>'
    s = s.replace('\n</urlset>', add + '\n</urlset>')
    open(SITEMAP, 'w', encoding='utf-8').write(s)
    print('built', len(ARTICLES), 'articles')

if __name__ == '__main__':
    build()

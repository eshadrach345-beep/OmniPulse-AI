import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, AudioLines, CalendarClock, Check, ChevronDown, Clapperboard, Film, Layers3, Play, Scissors, Sparkles, TrendingUp, WandSparkles, Zap } from 'lucide-react';
import { Auth, PlanInfo } from '../services/authService';
import { COMPANY, SUPPORT_EMAIL, LegalLinks } from './Legal';
import { formatMoney, annualSavingPct } from '../services/money';
import { SHOWCASE } from '../data/showcase';

const FEATURES = [
  { icon: TrendingUp, index: '01', title: 'Find a story worth telling', text: 'Research fresh conversations, creator momentum and searchable angles before you spend time producing.' },
  { icon: Clapperboard, index: '02', title: 'Build the first cut with AI', text: 'Turn a brief into a screenplay, scene plan, cast direction and model-ready shots. Keep control before rendering.' },
  { icon: Scissors, index: '03', title: 'Edit with precision', text: 'Arrange video, overlays, text, captions and sound on a multi-track timeline. Split, trim, reorder and refine.' },
  { icon: CalendarClock, index: '04', title: 'Publish on your schedule', text: 'Prepare platform-specific copy, manage channel connections and schedule the finished work.' },
];

const FLOW = [
  { title: 'Research', copy: 'Spot the angle and understand the audience.', icon: TrendingUp, color: 'violet' },
  { title: 'Create', copy: 'Shape the story and produce your scenes.', icon: WandSparkles, color: 'orange' },
  { title: 'Edit', copy: 'Make the cut yours, down to the frame.', icon: Scissors, color: 'blue' },
  { title: 'Publish', copy: 'Package and distribute the finished piece.', icon: CalendarClock, color: 'green' },
];

const FAQ = [
  ['Can I connect more than one social platform?', 'Yes. Connect the platforms available to your account from Social Accounts. Your plan and each platform’s permissions determine which channels and publishing actions are available.'],
  ['Can I publish a generated video directly?', 'After a video is ready, choose the connected channels you want to publish to or add it to your schedule. Review the video, caption and platform requirements before confirming.'],
  ['Do I need to review AI-generated content?', 'Yes. AI scripts, subtitles and media can contain mistakes. Review and edit everything before publishing. You are responsible for the content you share.'],
  ['How do I connect my accounts?', 'Choose Connect next to a network, sign in on that network’s own page and approve access. OmniPulse never asks for your social password.'],
  ['What quality are the videos?', 'Video quality and monthly seconds depend on your plan and selected generation model. The editor exports supported edits as MP4.'],
  ['Is there a free trial?', 'A 7-day trial is available with a one-time card check. It does not automatically renew.'],
  ['Can I cancel anytime?', 'Yes. Cancel from Plans & billing and keep access until the end of the period you paid for.'],
  ['Who owns the content I create?', 'You do. We process your media to provide the service.'],
  ['Is my data safe?', 'Passwords are hashed, connections are encrypted, and private media is scoped to your account.'],
  ['How are payments handled?', 'Payments are handled by Flutterwave. OmniPulse does not store your card details.'],
];

export const Landing: React.FC<{ onGetStarted: (mode: 'signup' | 'signin') => void }> = ({ onGetStarted }) => {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [annual, setAnnual] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => { Auth.plans().then(setPlans).catch(() => undefined); }, []);
  const referencePlan = plans.find((plan) => plan.id === 'pro' && plan.available) || plans.find((plan) => plan.available);
  const saving = referencePlan ? annualSavingPct(referencePlan.monthly, referencePlan.annual) : 0;

  return (
    <div className="op-landing min-h-screen text-white">
      <header className="op-nav sticky top-0 z-40">
        <div className="mx-auto flex h-[74px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <a href="#top" className="flex shrink-0 items-center gap-3">
            <img src="/omnipulse-mark.svg" alt="" className="h-10 w-10 rounded-[14px] shadow-lg shadow-violet-500/20" />
            <span className="font-display text-lg font-extrabold tracking-tight">OmniPulse<span className="op-wordmark"> AI</span></span>
          </a>
          <nav className="hidden items-center gap-7 text-[13px] font-semibold text-slate-300 md:flex" aria-label="Main navigation">
            <a href="#platform" className="transition hover:text-white">Platform</a>
            <a href="#showcase" className="transition hover:text-white">Showcase</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => onGetStarted('signin')} className="rounded-xl px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:text-white sm:px-4">Sign in</button>
            <button onClick={() => onGetStarted('signup')} className="op-button-primary rounded-xl px-4 py-2.5 text-xs font-extrabold sm:px-5">Start creating <ArrowUpRight className="ml-1 inline h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="op-hero relative isolate overflow-hidden">
          <div className="op-hero-grid" />
          <div className="op-hero-glow op-glow-a" />
          <div className="op-hero-glow op-glow-b" />
          <div className="relative mx-auto grid max-w-[1440px] items-center gap-12 px-4 pb-20 pt-14 sm:px-7 sm:pt-20 lg:grid-cols-[.82fr_1.18fr] lg:gap-10 lg:px-10 lg:pb-28">
            <div className="relative z-10 max-w-[650px]">
              <div className="op-eyebrow inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[9px] font-extrabold uppercase tracking-[.22em]">
                <span className="op-live-dot" /> YOUR CREATIVE CONTROL ROOM
              </div>
              <h1 className="mt-7 max-w-[680px] font-display text-[3.35rem] font-extrabold leading-[.94] tracking-[-.065em] sm:text-6xl xl:text-[5.4rem]">
                From raw idea
                <span className="op-title-gradient block">to the final frame.</span>
              </h1>
              <p className="mt-7 max-w-xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
                Research the moment. Direct the story. Generate scenes. Edit every layer. Publish when it is ready. OmniPulse brings the creative workflow into one connected studio.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => onGetStarted('signup')} className="op-button-primary rounded-2xl px-6 py-4 text-sm font-extrabold">
                  <Sparkles className="mr-2 inline h-4 w-4" /> Create with OmniPulse <ArrowRight className="ml-2 inline h-4 w-4" />
                </button>
                <a href="#platform" className="op-button-ghost rounded-2xl px-5 py-4 text-sm font-bold">Explore the studio <ArrowUpRight className="ml-2 inline h-4 w-4" /></a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-[10px] font-semibold text-slate-400">
                <span><Check className="mr-1.5 inline h-3.5 w-3.5 text-orange-300" /> Human-controlled edits</span>
                <span><Check className="mr-1.5 inline h-3.5 w-3.5 text-orange-300" /> AI-assisted production</span>
                <span><Check className="mr-1.5 inline h-3.5 w-3.5 text-orange-300" /> One publishing workflow</span>
              </div>
              <p className="mt-5 text-[10px] text-slate-500">7-day trial available · One-time card check · No automatic renewal</p>
            </div>

            <div className="op-stage relative mx-auto w-full max-w-[790px]">
              <div className="op-stage-orbit op-orbit-one" />
              <div className="op-stage-orbit op-orbit-two" />
              <div className="op-stage-shadow" />
              <div className="op-float-card op-float-top">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[.16em] text-violet-100"><TrendingUp className="h-3.5 w-3.5" /> Trend radar</span><span className="op-tiny-live">LIVE</span></div>
                <p className="mt-3 text-xs font-bold text-white">Audience interest is climbing</p>
                <div className="op-spark-bars mt-3"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
              </div>
              <div className="op-studio-card relative z-10">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2.5"><img src="/omnipulse-mark.svg" alt="" className="h-7 w-7 rounded-lg" /><div><p className="text-[10px] font-extrabold text-white">OMNIPULSE / CREATIVE STUDIO</p><p className="mt-0.5 text-[8px] text-slate-500">Untitled project · autosaved</p></div></div>
                  <div className="flex items-center gap-2"><span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[8px] font-bold text-emerald-200 sm:inline-flex">● READY</span><span className="rounded-lg border border-white/10 px-2 py-1 text-[8px] text-slate-400">9:16 · HD</span></div>
                </div>
                <div className="grid min-h-[315px] grid-cols-[48px_minmax(0,1fr)_138px] sm:grid-cols-[58px_minmax(0,1fr)_174px]">
                  <div className="op-tool-rail flex flex-col items-center gap-3 border-r border-white/10 py-4">
                    <span className="op-tool-active"><Film className="h-4 w-4" /></span><span><Layers3 className="h-4 w-4" /></span><span><AudioLines className="h-4 w-4" /></span><span><WandSparkles className="h-4 w-4" /></span><span><CalendarClock className="h-4 w-4" /></span>
                  </div>
                  <div className="op-preview-bay relative flex items-center justify-center overflow-hidden p-4 sm:p-6">
                    <div className="op-preview-aura" />
                    <div className="op-preview-frame relative flex h-[260px] w-[146px] flex-col justify-between overflow-hidden rounded-[18px] border border-white/20 p-3 sm:h-[280px] sm:w-[158px]">
                      <div className="op-preview-sun" />
                      <div className="op-preview-mountain op-mountain-a" />
                      <div className="op-preview-mountain op-mountain-b" />
                      <div className="relative z-10 flex items-center justify-between"><span className="rounded-full border border-white/20 bg-black/25 px-2 py-1 text-[7px] font-bold tracking-widest text-white">SCENE 04</span><span className="text-[8px] text-white/80">00:18</span></div>
                      <div className="relative z-10"><p className="text-[7px] font-extrabold uppercase tracking-[.28em] text-orange-100">A new chapter</p><p className="mt-2 font-display text-[25px] font-black leading-[.92] tracking-tight text-white">THE LAST<br />SIGNAL</p><span className="mt-3 block h-[3px] w-10 rounded-full bg-orange-300" /></div>
                    </div>
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[8px] text-slate-500"><Play className="h-3 w-3 fill-orange-300 text-orange-300" /> Preview monitor</div>
                  </div>
                  <div className="op-inspector-mini space-y-2 border-l border-white/10 p-2.5 sm:p-3">
                    <div className="op-mini-panel"><p className="flex items-center gap-1.5 text-[8px] font-extrabold uppercase tracking-wider text-violet-200"><WandSparkles className="h-3 w-3" /> AI Director</p><p className="mt-2 text-[10px] font-bold text-white">Tighten the opening</p><p className="mt-1 text-[8px] leading-4 text-slate-500">A clear hook in the first 2 seconds.</p></div>
                    <div className="op-mini-panel"><p className="flex items-center gap-1.5 text-[8px] font-extrabold uppercase tracking-wider text-orange-200"><Scissors className="h-3 w-3" /> Cut tools</p><div className="mt-3 flex flex-wrap gap-1"><b>Split</b><b>Trim</b><b>Speed</b><b>Fade</b></div></div>
                    <div className="op-mini-panel"><p className="flex items-center gap-1.5 text-[8px] font-extrabold uppercase tracking-wider text-emerald-200"><AudioLines className="h-3 w-3" /> Sound</p><p className="mt-2 text-[9px] text-slate-300">Voice · music · effects</p></div>
                  </div>
                </div>
                <div className="op-timeline-preview border-t border-white/10 px-3 py-3 sm:px-4">
                  <div className="mb-3 flex items-center justify-between"><span className="text-[8px] font-extrabold uppercase tracking-[.2em] text-slate-500">Multi-track timeline</span><span className="font-mono text-[8px] text-slate-500">00:00 — 00:30</span></div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2"><span className="w-8 text-[7px] font-extrabold text-slate-600">VIDEO</span><div className="op-timeline-track"><i /><i /><i /><i /><i /></div></div>
                    <div className="flex items-center gap-2"><span className="w-8 text-[7px] font-extrabold text-slate-600">TEXT</span><div className="op-timeline-track op-track-text"><i /><i /></div></div>
                    <div className="flex items-center gap-2"><span className="w-8 text-[7px] font-extrabold text-slate-600">AUDIO</span><div className="op-wave-track"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
                  </div>
                </div>
              </div>
              <div className="op-float-card op-float-bottom">
                <div className="flex items-center gap-2"><span className="op-card-icon"><Zap className="h-4 w-4" /></span><div><p className="text-[8px] font-extrabold uppercase tracking-[.16em] text-slate-400">Publishing desk</p><p className="text-[10px] font-bold text-white">One final cut. Every channel.</p></div></div>
                <div className="mt-3 flex gap-1.5"><span className="op-social-dot">▶</span><span className="op-social-dot">♪</span><span className="op-social-dot">◎</span><span className="op-social-dot">in</span><span className="ml-auto text-[8px] font-semibold text-emerald-200">READY TO SCHEDULE</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="op-proof-strip mx-auto grid max-w-[1440px] grid-cols-2 gap-4 px-4 py-8 sm:grid-cols-4 sm:px-7 lg:px-10">
          <div><strong>01</strong><span>Research before production</span></div>
          <div><strong>02</strong><span>AI-assisted scene creation</span></div>
          <div><strong>03</strong><span>Hands-on multi-track editing</span></div>
          <div><strong>04</strong><span>Connected social publishing</span></div>
        </section>

        <section id="platform" className="mx-auto max-w-[1440px] px-4 py-20 sm:px-7 sm:py-28 lg:px-10">
          <div className="op-section-heading max-w-3xl"><p className="op-section-label">ONE CONNECTED WORKFLOW</p><h2 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">All the moving parts.<span className="op-heading-accent"> One creative direction.</span></h2><p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">OmniPulse is designed to keep the idea, production choices, media, edit and distribution connected from the first decision to the final export.</p></div>
          <div className="mt-11 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map(({ icon: Icon, index, title, text }) => <article key={index} className="op-feature-card"><div className="flex items-center justify-between"><span className="op-feature-icon"><Icon className="h-5 w-5" /></span><span className="font-mono text-[10px] text-slate-600">{index}</span></div><h3 className="mt-7 font-display text-lg font-extrabold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{text}</p></article>)}
          </div>
        </section>

        <section className="op-flow-section mx-auto max-w-[1440px] px-4 pb-20 sm:px-7 sm:pb-28 lg:px-10">
          <div className="grid items-center gap-10 rounded-[30px] border border-white/10 p-6 sm:p-9 lg:grid-cols-[.82fr_1.18fr] lg:p-12">
            <div><p className="op-section-label">FROM IDEA TO DISTRIBUTION</p><h2 className="mt-4 font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">A workflow that moves with your imagination.</h2><p className="mt-4 text-sm leading-7 text-slate-400">Choose the parts you need. Keep the creative decisions in your hands. Bring your own footage or start with AI-assisted creation.</p><button onClick={() => onGetStarted('signup')} className="op-button-primary mt-7 rounded-xl px-5 py-3 text-xs font-extrabold">Explore OmniPulse <ArrowRight className="ml-2 inline h-4 w-4" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">{FLOW.map(({ title, copy, icon: Icon, color }, index) => <div key={title} className={'op-flow-card op-flow-' + color}><span className="op-flow-number">0{index + 1}</span><Icon className="h-5 w-5" /><h3 className="mt-4 font-display text-base font-extrabold text-white">{title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-400">{copy}</p></div>)}</div>
          </div>
        </section>

        {SHOWCASE.length > 0 && <section id="showcase" className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-7 sm:pb-28 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="op-section-label">CREATOR SHOWCASE</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Stories deserve a proper screen.</h2></div><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Example productions</span></div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{SHOWCASE.map((item, index) => <figure key={item.src} className="op-showcase-card overflow-hidden rounded-2xl"><div className="relative"><span className="op-showcase-index">0{index + 1}</span><video className="aspect-[9/14] w-full bg-black object-cover" src={item.src} poster={item.poster} controls playsInline preload="none" aria-label={item.title} /></div><figcaption className="flex items-center justify-between gap-2 p-4"><span className="text-sm font-extrabold text-white">{item.title}</span><span className="op-showcase-tag">{item.tag}</span></figcaption></figure>)}</div>
        </section>}

        <section id="pricing" className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-7 sm:pb-28 lg:px-10">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="op-section-label">PLANS & ACCESS</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Choose your room to create.</h2></div><div className="op-billing-switch inline-flex rounded-xl p-1 text-xs">{[false, true].map((value) => <button key={String(value)} onClick={() => setAnnual(value)} aria-pressed={annual === value} className={annual === value ? 'active' : ''}>{value ? 'Yearly' + (saving > 0 ? ' · Save ' + saving + '%' : '') : 'Monthly'}</button>)}</div></div>
          <div className="grid items-stretch gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const featured = plan.id === 'pro';
              const available = plan.available;
              return <article key={plan.id} className={featured ? 'op-price-card featured' : 'op-price-card'}>
                <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg font-extrabold text-white">{plan.name}</h3>{featured && <span className="op-most-popular">Most chosen</span>}</div>
                <p className="mt-6"><span className="font-display text-4xl font-extrabold tracking-tight text-white">{available ? formatMoney(annual ? plan.annual : plan.monthly, plan.currency) : 'Unavailable'}</span><span className="ml-1 text-xs text-slate-500">/month</span></p>
                {annual && available && <p className="mt-1 text-xs text-slate-500">Billed yearly</p>}
                <ul className="my-7 space-y-3 text-xs text-slate-300"><li><Check className="mr-2 inline h-4 w-4 text-orange-300" />{plan.secondsPerMonth || plan.videosPerMonth * 5} video seconds monthly</li>{plan.quality && <li><Check className="mr-2 inline h-4 w-4 text-orange-300" />{plan.quality}</li>}<li><Check className="mr-2 inline h-4 w-4 text-orange-300" />Up to {plan.channels} connected channels</li><li><Check className="mr-2 inline h-4 w-4 text-orange-300" />Research, editor and scheduler</li></ul>
                <button onClick={() => onGetStarted('signup')} className={featured ? 'op-plan-button primary' : 'op-plan-button'}>Choose plan <ArrowUpRight className="ml-1 inline h-4 w-4" /></button>
              </article>;
            })}
            {!plans.length && <div className="col-span-full rounded-2xl border border-white/10 bg-white/[.025] p-6 text-sm text-slate-400">Loading current plans…</div>}
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-4 pb-20 sm:px-7 sm:pb-28">
          <p className="op-section-label">GOOD TO KNOW</p><h2 className="mt-3 mb-7 font-display text-3xl font-extrabold text-white sm:text-4xl">Questions, answered.</h2>
          {FAQ.map(([question, answer], index) => <div key={question} className="op-faq-row"><button onClick={() => setOpen(open === index ? null : index)} aria-expanded={open === index} className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-bold text-white">{question}<ChevronDown className={open === index ? 'h-4 w-4 shrink-0 rotate-180 text-orange-300' : 'h-4 w-4 shrink-0 text-slate-500'} /></button>{open === index && <p className="max-w-2xl pb-5 text-sm leading-6 text-slate-400">{answer}</p>}</div>)}
        </section>

        <section className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-7 sm:pb-20 lg:px-10"><div className="op-final-cta flex flex-col items-start justify-between gap-6 rounded-[28px] p-7 sm:p-10 md:flex-row md:items-center"><div><p className="op-section-label">MAKE THE NEXT MOVE</p><h2 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">Make something worth watching.</h2><p className="mt-2 text-sm text-slate-300">Bring the idea. Shape the story. Own the final cut.</p></div><button onClick={() => onGetStarted('signup')} className="op-button-primary rounded-2xl px-6 py-4 text-sm font-extrabold">Start creating <ArrowUpRight className="ml-2 inline h-4 w-4" /></button></div></section>
      </main>
      <footer className="op-footer border-t px-4 py-8 text-center text-xs text-slate-500"><p className="font-extrabold text-slate-300">OmniPulse AI · Make every frame count.</p><p className="mt-2">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p><p className="mt-2"><a href="/blog">Blog</a> · <LegalLinks /> · <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a></p></footer>
    </div>
  );
};

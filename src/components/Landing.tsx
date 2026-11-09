import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, AudioLines, CalendarDays, Check, ChevronDown, Clapperboard, Film, Layers3, LineChart, Mic2, Play, RadioTower, Sparkles, Wand2, Zap } from 'lucide-react';
import { Auth, PlanInfo } from '../services/authService';
import { COMPANY, SUPPORT_EMAIL, LegalLinks } from './Legal';
import { formatMoney, annualSavingPct } from '../services/money';
import { GENRE_OPTIONS, PRESENTATION_OPTIONS } from '../data/storyOptions';
import { SHOWCASE } from '../data/showcase';

const FEATURES = [
  { icon: LineChart, title: 'Find the signal', text: 'Research recent topics, creators and search phrases before you commit to an idea.' },
  { icon: Clapperboard, title: 'Direct the story', text: 'Shape the script, characters, scene plan, camera language and tone before rendering.' },
  { icon: Film, title: 'Build the cut', text: 'Arrange footage, visual layers, captions and sound on a proper editing timeline.' },
  { icon: Wand2, title: 'Use AI with purpose', text: 'Ask the AI Director for edit ideas, match your uploaded media and create timed captions.' },
  { icon: AudioLines, title: 'Shape the sound', text: 'Mix original audio, music and voice tracks, with clip volume and fades.' },
  { icon: CalendarDays, title: 'Publish with control', text: 'Connect your channels, prepare captions and schedule content from one place.' },
];

const STEPS = [
  { name: 'Discover', text: 'Find a timely angle worth making.' },
  { name: 'Direct', text: 'Turn the angle into a clear production plan.' },
  { name: 'Create', text: 'Generate scenes and bring your media together.' },
  { name: 'Edit', text: 'Refine the cut, captions and soundtrack.' },
  { name: 'Publish', text: 'Schedule the finished work to your channels.' },
];

const FAQ = [
  ['Can I connect more than one social platform?', 'Yes. Connect the platforms available in your account from Social Accounts. Your plan and each platform’s permissions determine which channels and publishing actions are available.'],
  ['Can I publish a generated video directly?', 'After a video is ready, choose the connected channels you want to publish to or add it to your schedule. Review the video, caption and platform requirements before confirming.'],
  ['Do I need to review AI-generated content?', 'Yes. AI scripts, subtitles and media can contain mistakes. Review and edit everything before publishing. You are responsible for the content you share.'],
  ['How do I connect my accounts?', 'Choose Connect next to a network, sign in on that network’s own page and approve access. OmniPulse never asks for your social password.'],
  ['What quality are the videos?', 'Video quality and monthly seconds depend on your plan and on the selected generation model. The editor exports supported edits as MP4.'],
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
  const referencePlan = plans.find((plan) => plan.id === 'pro' && plan.monthlyAvailable && plan.annualAvailable)
    || plans.find((plan) => plan.monthlyAvailable && plan.annualAvailable);
  const saving = referencePlan ? annualSavingPct(referencePlan.monthly, referencePlan.annual) : 0;

  return (
    <div className="landing-shell min-h-full text-white">
      <header className="landing-nav sticky top-0 z-40">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-3">
            <img src="/omnipulse-mark.svg" alt="" className="h-10 w-10 rounded-2xl shadow-lg shadow-cyan-500/10" />
            <span className="font-display text-lg font-extrabold tracking-tight">OmniPulse <span className="landing-wordmark-accent">AI</span></span>
          </a>
          <nav className="flex items-center gap-2 sm:gap-6 text-sm" aria-label="Main navigation">
            <a href="#platform" className="hidden text-slate-300 transition hover:text-white sm:inline">Platform</a>
            <a href="#showcase" className="hidden text-slate-300 transition hover:text-white sm:inline">Showcase</a>
            <a href="#pricing" className="hidden text-slate-300 transition hover:text-white sm:inline">Pricing</a>
            <button onClick={() => onGetStarted('signin')} className="rounded-xl px-3 py-2.5 text-slate-300 transition hover:text-white">Sign in</button>
            <button onClick={() => onGetStarted('signup')} className="landing-primary-button rounded-xl px-4 py-2.5 text-sm font-bold">Get started <ArrowUpRight className="ml-1 inline h-4 w-4" /></button>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero relative isolate overflow-hidden">
          <div className="landing-hero-grid" />
          <div className="landing-aurora landing-aurora-one" />
          <div className="landing-aurora landing-aurora-two" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[0.88fr_1.12fr] lg:gap-8 lg:pb-24">
            <div className="relative z-10 max-w-2xl">
              <div className="landing-kicker inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.2em]">
                <span className="landing-live-dot" /> THE CREATOR OPERATING SYSTEM
              </div>
              <h1 className="mt-7 font-display text-[3.25rem] font-extrabold leading-[.98] tracking-[-.055em] sm:text-6xl xl:text-[5rem]">
                Make the idea.
                <span className="landing-gradient-title block">Shape the moment.</span>
                Publish the story.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                One connected workspace for trend research, AI video production, hands-on editing and social publishing. Go from a blank page to a finished cut without losing the creative thread.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => onGetStarted('signup')} className="landing-primary-button rounded-2xl px-6 py-4 text-sm font-extrabold shadow-xl">
                  <Sparkles className="mr-2 inline h-4 w-4" /> Build your next video <ArrowUpRight className="ml-2 inline h-4 w-4" />
                </button>
                <a href="#platform" className="landing-secondary-button rounded-2xl px-6 py-4 text-sm font-bold">Explore the platform <ArrowDownRight className="ml-2 inline h-4 w-4" /></a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-400">
                <span><Check className="mr-1.5 inline h-3.5 w-3.5 text-cyan-300" /> Review before rendering</span>
                <span><Check className="mr-1.5 inline h-3.5 w-3.5 text-cyan-300" /> Edit your own media</span>
                <span><Check className="mr-1.5 inline h-3.5 w-3.5 text-cyan-300" /> Keep publishing in one place</span>
              </div>
              <p className="mt-5 text-[10px] text-slate-500">7-day trial available. One-time card check; no automatic renewal.</p>
            </div>

            <div className="landing-stage relative mx-auto w-full max-w-[760px]">
              <div className="landing-stage-halo" />
              <div className="landing-orbit orbit-a" />
              <div className="landing-orbit orbit-b" />
              <div className="landing-float-card landing-float-left">
                <div className="flex items-center gap-2"><span className="landing-mini-icon"><LineChart className="h-4 w-4" /></span><span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Trend radar</span></div>
                <p className="mt-3 text-sm font-bold text-white">A fresh angle is rising</p>
                <div className="mt-2 flex items-end gap-1"><span className="h-3 w-2 rounded-sm bg-cyan-400/40" /><span className="h-5 w-2 rounded-sm bg-cyan-400/55" /><span className="h-4 w-2 rounded-sm bg-cyan-400/60" /><span className="h-8 w-2 rounded-sm bg-cyan-300" /><span className="h-10 w-2 rounded-sm bg-cyan-200" /><span className="ml-2 text-[10px] font-bold text-cyan-200">Live research</span></div>
              </div>
              <div className="landing-editor-window relative z-10">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2.5"><img src="/omnipulse-mark.svg" alt="" className="h-7 w-7 rounded-lg" /><div><p className="text-[11px] font-extrabold text-white">OmniPulse Studio</p><p className="text-[9px] text-slate-500">Project / The Last Signal</p></div></div>
                  <div className="flex items-center gap-1.5"><span className="landing-status-pill"><span />Autosaved</span><span className="hidden rounded-md border border-white/10 px-2 py-1 text-[9px] text-slate-400 sm:inline">9:16 · 1080p</span></div>
                </div>
                <div className="landing-editor-body grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_150px]">
                  <div className="landing-preview-wrap relative flex min-h-[290px] items-center justify-center overflow-hidden rounded-xl border border-white/10 p-4">
                    <div className="landing-preview-grain" />
                    <div className="landing-preview-art relative flex h-[250px] w-[142px] flex-col justify-between overflow-hidden rounded-[19px] border border-white/20 p-3 shadow-2xl">
                      <div className="landing-preview-sun" />
                      <div className="relative z-10 flex items-center justify-between"><span className="rounded-full border border-white/20 bg-black/20 px-2 py-1 text-[8px] font-semibold tracking-widest text-white">SCENE 04</span><span className="text-[8px] text-white/80">00:18</span></div>
                      <div className="relative z-10"><p className="text-[8px] font-bold uppercase tracking-[.25em] text-cyan-100">A new chapter</p><p className="mt-1 font-display text-xl font-extrabold leading-none text-white">THE LAST<br />SIGNAL</p><div className="mt-2 h-[2px] w-8 bg-cyan-300" /></div>
                    </div>
                    <div className="absolute bottom-3 left-4 flex items-center gap-2 text-[9px] text-slate-400"><Play className="h-3 w-3 fill-cyan-300 text-cyan-300" /> Preview monitor</div>
                  </div>
                  <div className="space-y-2">
                    <div className="landing-side-stat"><div className="flex items-center gap-2 text-cyan-200"><Wand2 className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-wider">AI Director</span></div><p className="mt-2 text-xs font-bold text-white">Tighten the opening</p><p className="mt-1 text-[9px] leading-4 text-slate-500">Review suggestions before you apply them.</p></div>
                    <div className="landing-side-stat"><div className="flex items-center gap-2 text-violet-200"><Layers3 className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-wider">Layers</span></div><div className="mt-3 space-y-1.5"><div className="h-2 rounded-full bg-gradient-to-r from-cyan-300 to-cyan-500" /><div className="ml-4 h-2 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500" /><div className="ml-2 h-2 w-4/5 rounded-full bg-gradient-to-r from-amber-300 to-orange-400" /></div></div>
                    <div className="landing-side-stat"><div className="flex items-center gap-2 text-emerald-200"><Mic2 className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-wider">Audio</span></div><p className="mt-2 text-[10px] text-slate-300">Voice · music · captions</p></div>
                  </div>
                </div>
                <div className="border-t border-white/10 bg-[#090f1c] px-3 py-3 sm:px-4">
                  <div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">Timeline</span><span className="text-[9px] tabular-nums text-slate-500">00:00 — 00:30</span></div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2"><span className="w-10 text-[8px] font-bold text-slate-500">VIDEO</span><div className="flex flex-1 gap-1"><span className="h-4 flex-1 rounded bg-cyan-500/70" /><span className="h-4 flex-1 rounded bg-cyan-300/80" /><span className="h-4 flex-1 rounded bg-violet-400/80" /><span className="h-4 flex-1 rounded bg-fuchsia-400/80" /></div></div>
                    <div className="flex items-center gap-2"><span className="w-10 text-[8px] font-bold text-slate-500">TEXT</span><div className="flex flex-1 gap-1"><span className="h-3 w-1/4 rounded bg-violet-400/75" /><span className="h-3 w-1/5 rounded bg-violet-300/55" /></div></div>
                    <div className="flex items-center gap-2"><span className="w-10 text-[8px] font-bold text-slate-500">AUDIO</span><div className="h-3 flex-1 rounded bg-gradient-to-r from-orange-300/70 via-amber-300/50 to-orange-400/70" /></div>
                  </div>
                </div>
              </div>
              <div className="landing-float-card landing-float-right">
                <div className="flex items-center gap-2"><span className="landing-mini-icon"><RadioTower className="h-4 w-4" /></span><span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Publishing hub</span></div>
                <p className="mt-2 text-sm font-bold text-white">Ready for your channels</p>
                <p className="mt-1 text-[10px] text-slate-500">Review · schedule · publish</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-step-strip mx-auto max-w-7xl px-4 py-9 sm:px-6">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-5">
            {STEPS.map((step, index) => (
              <div key={step.name} className="landing-step">
                <span className="text-[10px] font-extrabold tracking-[.18em] text-cyan-300">0{index + 1}</span>
                <h2 className="mt-2 font-display text-lg font-bold text-white">{step.name}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <p className="landing-eyebrow">THE WORKSPACE</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-5xl">Every tool has a place.<br /><span className="landing-gradient-title">Every step stays connected.</span></h2>
            <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">Built around a practical production path: research, story, media, edit and distribution.</p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className="landing-feature-card group">
                <span className="landing-feature-number">0{index + 1}</span>
                <div className="landing-feature-icon"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-5 font-display text-lg font-bold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="landing-director-panel grid items-center gap-8 rounded-[28px] p-6 sm:p-9 lg:grid-cols-[1fr_.9fr]">
            <div><p className="landing-eyebrow">CREATIVE CONTROL</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Direct the story, not just the prompt.</h2><p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">Choose the format, genre, pacing and camera language. Review the scene plan, keep your source media close and shape the final edit in the studio.</p><div className="mt-5 flex flex-wrap gap-2">{PRESENTATION_OPTIONS.slice(0, 4).map((option) => <span key={option.id} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">{option.emoji} {option.label}</span>)}</div></div>
            <div className="grid grid-cols-2 gap-3">{GENRE_OPTIONS.filter((genre) => genre.id !== 'auto').slice(0, 8).map((genre) => <div key={genre.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3"><span className="text-xl">{genre.emoji}</span><span className="text-xs font-semibold text-slate-200">{genre.label}</span></div>)}</div>
          </div>
        </section>

        {SHOWCASE.length > 0 && (
          <section id="showcase" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24">
            <p className="landing-eyebrow">MADE WITH OMNIPULSE</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">From first frame to final story.</h2><span className="text-xs text-slate-500">Example productions</span></div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SHOWCASE.map((item) => (
                <figure key={item.src} className="landing-showcase-card overflow-hidden rounded-2xl">
                  <video className="aspect-[9/14] w-full bg-black object-cover" src={item.src} poster={item.poster} controls playsInline preload="none" aria-label={item.title} />
                  <figcaption className="flex items-center justify-between gap-2 p-4"><span className="text-sm font-bold text-white">{item.title}</span><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-200">{item.tag}</span></figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <section id="pricing" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div><p className="landing-eyebrow">SIMPLE PLANS</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Room to create more.</h2></div>
            <div className="landing-billing-switch inline-flex rounded-xl p-1 text-xs">
              {[false, true].map((value) => <button key={String(value)} onClick={() => setAnnual(value)} aria-pressed={annual === value} className={annual === value ? 'active' : ''}>{value ? 'Yearly' + (saving > 0 ? ' · Save ' + saving + '%' : '') : 'Monthly'}</button>)}
            </div>
          </div>
          <div className="grid items-stretch gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const featured = plan.id === 'pro';
              const available = annual ? plan.annualAvailable : plan.monthlyAvailable;
              return <article key={plan.id} className={featured ? 'landing-price-card featured' : 'landing-price-card'}>
                <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg font-bold text-white">{plan.name}</h3>{featured && <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-200">Most chosen</span>}</div>
                <p className="mt-5"><span className="font-display text-4xl font-extrabold text-white">{available ? formatMoney(annual ? plan.annual : plan.monthly, plan.currency) : 'Unavailable'}</span><span className="ml-1 text-xs text-slate-400">/month</span></p>
                {annual && available && <p className="mt-1 text-xs text-slate-500">Billed yearly</p>}
                <ul className="my-6 space-y-3 text-sm text-slate-300">
                  <li><Check className="mr-2 inline h-4 w-4 text-cyan-300" />{plan.secondsPerMonth || plan.videosPerMonth * 5} video seconds monthly</li>
                  {plan.quality && <li><Check className="mr-2 inline h-4 w-4 text-cyan-300" />{plan.quality}</li>}
                  <li><Check className="mr-2 inline h-4 w-4 text-cyan-300" />Up to {plan.channels} connected channels</li>
                  <li><Check className="mr-2 inline h-4 w-4 text-cyan-300" />Research, editor and scheduler</li>
                </ul>
                <button onClick={() => onGetStarted('signup')} className={featured ? 'landing-plan-button primary' : 'landing-plan-button'}>Choose plan <ArrowUpRight className="ml-1 inline h-4 w-4" /></button>
              </article>;
            })}
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-4 pb-20 sm:px-6 sm:pb-28">
          <p className="landing-eyebrow">GOOD TO KNOW</p><h2 className="mt-3 mb-6 font-display text-3xl font-extrabold text-white sm:text-4xl">Questions, answered.</h2>
          {FAQ.map(([question, answer], index) => <div key={question} className="landing-faq-row">
            <button onClick={() => setOpen(open === index ? null : index)} aria-expanded={open === index} className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-semibold text-white">{question}<ChevronDown className={open === index ? 'h-4 w-4 shrink-0 rotate-180 text-cyan-200' : 'h-4 w-4 shrink-0 text-slate-500'} /></button>
            {open === index && <p className="pb-5 text-sm leading-6 text-slate-400">{answer}</p>}
          </div>)}
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20">
          <div className="landing-final-cta flex flex-col items-start justify-between gap-6 rounded-[28px] p-7 sm:p-10 md:flex-row md:items-center">
            <div><p className="landing-eyebrow">YOUR NEXT IDEA STARTS HERE</p><h2 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">Make something worth watching.</h2><p className="mt-2 text-sm text-slate-300">Bring your idea. OmniPulse brings the workspace.</p></div>
            <button onClick={() => onGetStarted('signup')} className="landing-primary-button rounded-2xl px-6 py-4 text-sm font-extrabold">Start creating <ArrowUpRight className="ml-2 inline h-4 w-4" /></button>
          </div>
        </section>
      </main>

      <footer className="landing-footer border-t px-4 py-8 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-300">OmniPulse AI · Create with intention.</p>
        <p className="mt-2">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        <p className="mt-2"><a href="/blog">Blog</a> · <LegalLinks /> · <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a></p>
      </footer>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Zap, Video, TrendingUp, CalendarClock, Split, Share2, Mic, Check, ChevronDown } from 'lucide-react';
import { Auth, PlanInfo } from '../services/authService';
import { COMPANY, SUPPORT_EMAIL, LegalLinks } from './Legal';
import { formatMoney, annualSavingPct } from '../services/money';

const FEATURES = [
  { icon: TrendingUp, title: 'Research what is trending right now', text: 'Live web research on your niche: the topics, hashtags and creators gaining ground this week, with hooks you can use today.' },
  { icon: Video, title: 'Turn an idea into a finished video', text: 'Describe the story. OmniPulse writes the script with characters, tells you the length before it renders, then produces every scene.' },
  { icon: CalendarClock, title: 'Schedule everywhere from one calendar', text: 'Queue posts for all your connected channels and publish them directly, without logging into each app.' },
  { icon: Split, title: 'Test two hooks and keep the winner', text: 'Publish two versions of a post and compare real results with a significance check before you commit.' },
  { icon: Mic, title: 'Characters that speak', text: 'Dramas, documentaries and animations where every character talks, with the voices made together with the picture.' },
  { icon: Share2, title: 'Connect in one tap', text: 'Sign in on each network\'s own page and approve access. OmniPulse never sees your password.' },
];

const STEPS = [
  { name: 'Research', text: 'Find what your niche is watching.' },
  { name: 'Script', text: 'Get a hook and scene-by-scene plan.' },
  { name: 'Render', text: 'Generate the video and voice-over.' },
  { name: 'Publish', text: 'Post or schedule to your channels.' },
  { name: 'Learn', text: 'Test hooks and keep what wins.' },
];

const FAQ = [
  ['How do I connect my accounts?', 'Click Connect next to a network, sign in on that network\'s own page and approve access. OmniPulse never sees your password. You can disconnect at any time.'],
  ['What quality are the videos?', 'Quality depends on your plan: Standard (480p), HD (768p) or Full HD (1080p, AI-enhanced). Productions are made scene by scene, and you can download the finished video as one MP4.'],
  ['Is there a free trial?', 'You can try OmniPulse for 7 days for a small one-time card check. It includes trend research, the scheduler and a short AI video. A card is required so each person gets one trial, and it never renews by itself.'],
  ['Can I cancel anytime?', 'Yes. Cancel in one click from Plans & billing and keep access until the end of the period you paid for.'],
  ['Who owns the content I create?', 'You do. We only process it to run the service.'],
  ['Is my data safe?', 'Passwords are hashed, connections are encrypted, and access tokens are encrypted at rest. You can export or delete your data at any time.'],
  ['How are payments handled?', 'Securely by Flutterwave. We never see or store your card details.'],
];

/** The brand motif: a pulse line that draws itself once on load. */
const PulseLine: React.FC = () => (
  <svg viewBox="0 0 1200 120" className="w-full h-auto overflow-visible" aria-hidden="true">
    <path
      d="M0 60 H300 l18 -5 l18 5 H430 l14 -50 l24 104 l16 -74 l10 20 H720 l18 -7 l18 7 H920 l14 -36 l22 72 l14 -36 H1200"
      pathLength={1} fill="none" stroke="#3cc4b5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      className="pulse-line animate-draw"
    />
  </svg>
);

export const Landing: React.FC<{ onGetStarted: (mode: 'signup' | 'signin') => void }> = ({ onGetStarted }) => {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [annual, setAnnual] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => { Auth.plans().then(setPlans).catch(() => undefined); }, []);
  const ref = plans.find((p) => p.id === 'pro') || plans[0];
  const saving = ref ? annualSavingPct(ref.monthly, ref.annual) : 0;

  return (
    <div className="min-h-full text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-indigo-700 flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></div>
            <span className="font-display text-lg font-bold text-white tracking-tight">{COMPANY}</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-5 text-sm">
            <a href="#pricing" className="hidden sm:inline text-slate-300 hover:text-white">Pricing</a>
            <a href="#faq" className="hidden sm:inline text-slate-300 hover:text-white">FAQ</a>
            <a href="/blog" className="hidden sm:inline text-slate-300 hover:text-white">Blog</a>
            <button onClick={() => onGetStarted('signin')} className="text-slate-300 hover:text-white px-2 py-2">Sign in</button>
            <button onClick={() => onGetStarted('signup')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-2 transition-colors">Get started</button>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-24 pb-6">
        <h1 className="font-display text-[2.6rem] leading-[1.02] sm:text-7xl font-extrabold text-white max-w-4xl">
          Know what to post, make the video, publish it everywhere.
        </h1>
        <p className="mt-6 text-slate-300 text-lg sm:text-xl max-w-2xl leading-relaxed">
          OmniPulse is an AI video generator and social media scheduler. It researches your niche live, writes and renders short videos with a voice-over, then schedules them to every channel you connect.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button onClick={() => onGetStarted('signup')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-6 py-3.5 transition-colors">Create your account</button>
          <a href="#pricing" className="border border-slate-600 hover:border-slate-400 text-slate-100 rounded-xl px-6 py-3.5 transition-colors">See plans and prices</a>
        </div>
        <p className="mt-4 text-sm text-slate-400">7-day trial available. A card is required, and it never renews by itself.</p>
        <div className="relative mt-14 sm:mt-20">
          <PulseLine />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <ol className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-6">
          {STEPS.map((s, i) => (
            <li key={s.name} className="border-t border-slate-700 pt-3">
              <span className="font-mono text-xs text-indigo-300">{i + 1}</span>
              <p className="font-display font-bold text-white text-lg leading-tight mt-0.5">{s.name}</p>
              <p className="text-sm text-slate-400 mt-1">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-white max-w-2xl">Everything between the idea and the post</h2>
        <div className="mt-10 grid md:grid-cols-2 gap-x-14">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 py-6 border-t border-slate-800">
              <Icon className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-white text-lg leading-snug">{title}</h3>
                <p className="text-slate-400 mt-1.5 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">Plans</h2>
          <div className="inline-flex bg-slate-900 border border-slate-700 rounded-full p-1 text-xs">
            {[false, true].map((a) => (
              <button key={String(a)} onClick={() => setAnnual(a)} aria-pressed={annual === a} className={`px-4 py-2 rounded-full font-semibold transition-colors ${annual === a ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'}`}>
                {a ? `Yearly${saving > 0 ? `, save ${saving}%` : ''}` : 'Monthly'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-5 items-start">
          {plans.map((p) => {
            const featured = p.id === 'pro';
            return (
              <div key={p.id} className={`rounded-2xl p-6 sm:p-7 ${featured ? 'bg-slate-900 border-2 border-indigo-500 md:-mt-3' : 'bg-slate-900/60 border border-slate-700'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-white text-xl">{p.name}</h3>
                  {featured && <span className="text-xs font-semibold text-indigo-200 bg-indigo-900/70 rounded-full px-2.5 py-1">Most chosen</span>}
                </div>
                <p className="mt-4"><span className="font-display text-5xl font-extrabold text-white">{formatMoney(annual ? p.annual : p.monthly, p.currency)}</span><span className="text-sm text-slate-400"> per month</span></p>
                {annual && <p className="text-xs text-slate-400 mt-1">Billed yearly</p>}
                <ul className="text-slate-200 space-y-2.5 my-6">
                  <li className="flex gap-2.5"><Check className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />{p.secondsPerMonth || p.videosPerMonth * 5} seconds of AI video each month (5 or 10 second videos)</li>
                  {p.quality && <li className="flex gap-2.5"><Check className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />{p.quality}</li>}
                  <li className="flex gap-2.5"><Check className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />Up to {p.channels} connected channels</li>
                  <li className="flex gap-2.5"><Check className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />Live trend research, scheduler and A/B tests</li>
                </ul>
                <button onClick={() => onGetStarted('signup')} className={`w-full rounded-xl py-3 font-semibold transition-colors ${featured ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-100'}`}>Get started</button>
              </div>
            );
          })}
        </div>
      </section>

      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 scroll-mt-20">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-6">Questions</h2>
        {FAQ.map(([q, a], i) => (
          <div key={q} className="border-b border-slate-800">
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="w-full flex items-center justify-between gap-4 py-5 text-left font-semibold text-white">
              {q}<ChevronDown className={`w-5 h-5 shrink-0 text-slate-400 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="pb-5 text-slate-400 leading-relaxed">{a}</p>}
          </div>
        ))}
      </section>

      <footer className="border-t border-slate-800 py-8 px-4 text-center text-xs text-slate-500 space-y-1.5">
        <p>© {new Date().getFullYear()} {COMPANY}. All rights reserved. <span className="text-slate-600">Build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}</span></p>
        <p><a href="/blog" className="hover:text-slate-300">Blog</a> · <LegalLinks /> · <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-slate-300">{SUPPORT_EMAIL}</a></p>
      </footer>
    </div>
  );
};

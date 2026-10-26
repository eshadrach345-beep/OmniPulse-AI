import React, { useEffect, useState } from 'react';
import { AppUser, SubscriptionTier } from '../types/auth';
import { Auth, PlanInfo } from '../services/authService';
import { ApiError } from '../services/api';
import { formatMoney, annualSavingPct } from '../services/money';
import { Check, Crown, ShieldCheck, X, Loader2, LogOut, CreditCard } from 'lucide-react';

interface PricingModalProps {
  currentUser: AppUser;
  isOpen: boolean;
  /** Blocking = full-screen paywall with no way to dismiss (shown until a subscription is active). */
  blocking?: boolean;
  onClose?: () => void;
  onLogout?: () => void;
  onUserChange?: (u: AppUser) => void;
  notice?: string | null;
}

const FEATURES: Record<SubscriptionTier, { description: string; features: string[]; popular?: boolean }> = {
  starter: {
    description: 'Essential multi-platform scheduling for emerging creators.',
    features: ['Up to 2 connected channels', '50 seconds of AI video each month', 'Standard video quality (480p)', 'Manual & time-slot scheduling', 'Basic hashtag suggestions', 'Standard analytics overview'],
  },
  pro: {
    description: 'Autonomous multi-channel distribution, AI video studio & peak scheduling.',
    popular: true,
    features: ['Up to 7 channels connected at once', '150 seconds of AI video each month', 'HD video quality (768p)', 'Peak-time auto-pilot', 'Niche trend & viral hashtag radar', 'A/B testing & hook lift studio', 'Automated growth reports', 'Characters with voices'],
  },
  agency: {
    description: 'For agencies, high-volume studios, and multi-brand operators.',
    features: ['250 seconds of AI video each month', 'Full HD video quality (1080p, AI-enhanced)', 'Competitor tracker & content outranker', 'Priority rendering pipeline', 'Printable performance audits', 'Everything in Pro'],
  },
};

export const PricingModal: React.FC<PricingModalProps> = ({ currentUser, isOpen, blocking, onClose, onLogout, onUserChange, notice }) => {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [busy, setBusy] = useState<SubscriptionTier | 'manage' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<{ currency: string; trial: { days: number; seconds: number; price: number }; topups: { id: string; seconds: number; price: number }[] } | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => { if (isOpen && !plans.length) Auth.plans().then(setPlans).catch(() => undefined); }, [isOpen]);
  useEffect(() => { if (isOpen && !extras) Auth.extras().then(setExtras).catch(() => undefined); }, [isOpen]);
  if (!isOpen) return null;

  const subscribed = currentUser.hasAccess;
  const ref = plans.find((p) => p.id === 'pro') || plans[0];
  const saving = ref ? annualSavingPct(ref.monthly, ref.annual) : 0;
  const isOwner = !!currentUser.isOwner;

  const choose = async (tier: SubscriptionTier) => {
    setBusy(tier); setError(null);
    try { window.location.href = await Auth.checkout(tier, cycle); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not start checkout.'); setBusy(null); }
  };
  const startTrial = async () => {
    setBusy('manage'); setError(null);
    try { window.location.href = await Auth.checkoutTrial(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not start the trial.'); setBusy(null); }
  };
  const buyPack = async (id: string) => {
    setBuying(id); setError(null);
    try { window.location.href = await Auth.buyTopup(id); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not start the purchase.'); setBuying(null); }
  };
  const cancel = async () => {
    if (!window.confirm('Cancel your subscription? You keep access until the end of the period you already paid for.')) return;
    setBusy('manage'); setError(null);
    try { onUserChange?.(await Auth.cancelSubscription()); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not cancel the subscription.'); }
    finally { setBusy(null); }
  };

  const body = (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Crown className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">{blocking ? 'Choose a plan to get started' : 'Plans & billing'}</h2></div>
          <p className="text-sm text-slate-400 mt-1">
            {blocking ? `Welcome, ${currentUser.name.split(' ')[0]}. A subscription unlocks the video studio, trend radar, scheduler and auto-pilot.` : 'Upgrade, downgrade, or manage your payment method anytime.'}
          </p>
        </div>
        {blocking ? (
          <button onClick={onLogout} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 shrink-0"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
        ) : (
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        )}
      </div>

      {isOwner && <div className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">Owner test access is active. No subscription is needed.</div>}
      {(notice || currentUser.subscriptionStatus === 'past_due' || currentUser.subscriptionStatus === 'canceled' || (currentUser.subscriptionStatus === 'trial' && !currentUser.hasAccess)) && (
        <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          {notice || (currentUser.subscriptionStatus === 'trial' ? 'Your trial has ended. Pick a plan to continue.' : currentUser.subscriptionStatus === 'past_due' ? 'Your last payment failed. Subscribe again or update your payment method to restore access.' : 'Your subscription has ended. Pick a plan to continue.')}
        </div>
      )}
      {error && <div role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>}

      {currentUser.trialAvailable && extras && !isOwner && (
        <div className="rounded-xl border border-indigo-500/50 bg-indigo-950/40 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Try it for {extras.trial.days} days, {formatMoney(extras.trial.price, extras.currency)}</p>
            <p className="text-xs text-slate-300 mt-1">Includes live trend research, the scheduler and {extras.trial.seconds} seconds of AI video. A card is required so each person gets one trial. It does not renew by itself: you pick a plan when it ends.</p>
          </div>
          <button disabled={!!busy} onClick={startTrial} className="shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 flex items-center gap-2">
            {busy === 'manage' && <Loader2 className="w-4 h-4 animate-spin" />}Start trial
          </button>
        </div>
      )}
      {currentUser.isTrial && (
        <div className="text-xs text-indigo-200 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2">
          Your trial is active until {currentUser.currentPeriodEnd ? new Date(currentUser.currentPeriodEnd).toLocaleDateString() : 'the end of the week'}. Choose a plan below to keep going.
        </div>
      )}

      <div className="flex justify-center">
        <div className="inline-flex bg-slate-900 border border-slate-800 rounded-full p-1 text-xs">
          {(['monthly', 'annual'] as const).map((c) => (
            <button key={c} onClick={() => setCycle(c)} className={`px-4 py-1.5 rounded-full font-medium transition-colors ${cycle === c ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {c === 'monthly' ? 'Monthly' : `Annual${saving > 0 ? ` · save ${saving}%` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {(['starter', 'pro', 'agency'] as SubscriptionTier[]).map((id) => {
          const info = plans.find((p) => p.id === id);
          const f = FEATURES[id];
          const price = info ? (cycle === 'annual' ? info.annual : info.monthly) : null;
          const isCurrent = subscribed && currentUser.tier === id && currentUser.billingCycle === cycle;
          const unavailable = info && !info.available;
          return (
            <div key={id} className={`relative rounded-2xl border p-5 flex flex-col bg-slate-900 ${f.popular ? 'border-indigo-500 shadow-lg shadow-indigo-500/10' : 'border-slate-800'}`}>
              {f.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase bg-indigo-600 text-white rounded-full px-3 py-0.5">Most popular</span>}
              <h3 className="text-sm font-bold text-white">{info?.name || id}</h3>
              <p className="text-xs text-slate-400 mt-1 min-h-[2.5rem]">{f.description}</p>
              <div className="my-3">
                <span className="text-3xl font-extrabold text-white">{price !== null ? formatMoney(price, info?.currency) : '—'}</span>
                <span className="text-xs text-slate-400"> /month</span>
                {cycle === 'annual' && price !== null && <p className="text-[11px] text-slate-500">Billed {formatMoney(Math.round(price * 12 * 100) / 100, info?.currency)} per year</p>}
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300 flex-1 mb-4">
                {f.features.map((x) => <li key={x} className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />{x}</li>)}
              </ul>
              <button disabled={!!busy || isOwner || (isCurrent && currentUser.subscriptionStatus === 'active') || !!unavailable} onClick={() => choose(id)}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${f.popular ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-100'}`}>
                {busy === id && <Loader2 className="w-4 h-4 animate-spin" />}
                {isOwner ? 'Owner access' : isCurrent && currentUser.subscriptionStatus === 'active' ? 'Current plan' : unavailable ? 'Unavailable' : subscribed ? 'Switch to this plan' : 'Subscribe'}
              </button>
            </div>
          );
        })}
      </div>

      {extras && ['active', 'canceling', 'owner'].includes(currentUser.subscriptionStatus) && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-bold text-white">Need more video? Buy extra seconds</h3>
          <p className="text-xs text-slate-400 mt-1">Extra seconds never expire. They are used when your monthly seconds run out.</p>
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            {extras.topups.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{t.seconds} seconds</p>
                  <p className="text-xs text-slate-400">{formatMoney(t.price, extras.currency)}</p>
                </div>
                <button disabled={!!buying} onClick={() => buyPack(t.id)} className="rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 text-xs font-semibold px-3 py-2 flex items-center gap-1.5">
                  {buying === t.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Buy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Secure checkout by Flutterwave · Cancel anytime</span>
        {subscribed && currentUser.subscriptionStatus === 'active' && (
          <button onClick={cancel} disabled={busy === 'manage'} className="text-rose-300 hover:text-rose-200 flex items-center gap-1.5 text-xs">
            <CreditCard className="w-3.5 h-3.5" /> Cancel subscription
          </button>
        )}
        {subscribed && currentUser.subscriptionStatus === 'canceling' && currentUser.currentPeriodEnd && (
          <span className="text-amber-300 text-xs">Your plan ends on {new Date(currentUser.currentPeriodEnd).toLocaleDateString()}. Pick a plan to continue after that.</span>
        )}
      </div>
    </div>
  );

  if (blocking) return <div className="min-h-full bg-slate-950 p-4 sm:p-8 overflow-y-auto">{body}</div>;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 my-6 max-w-5xl mx-auto" onClick={(e) => e.stopPropagation()}>{body}</div>
    </div>
  );
};

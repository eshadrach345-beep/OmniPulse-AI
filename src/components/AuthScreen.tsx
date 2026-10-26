import React, { useEffect, useState } from 'react';
import { Zap, Mail, Lock, User, Briefcase, Loader2, ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { Auth } from '../services/authService';
import { ApiError } from '../services/api';
import { AppUser } from '../types/auth';

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';

const input = 'w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

function Field({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
      {children}
    </div>
  );
}

export const AuthScreen: React.FC<{ onAuthed: (u: AppUser) => void; notice?: string | null; initialMode?: 'signin' | 'signup'; onBack?: () => void }> = ({ onAuthed, notice, initialMode = 'signin', onBack }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice || null);
  const [cooldown, setCooldown] = useState(0);
  const [verifyPurpose, setVerifyPurpose] = useState<'verify' | 'reset'>('verify');
  const [showCode, setShowCode] = useState(false);
  const [accessCode, setAccessCode] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const go = (m: Mode) => { setMode(m); setError(null); setInfo(null); setCode(''); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === 'signup') {
        await Auth.register({ name, email, password, brandName: brand, acceptTerms: accepted });
        setVerifyPurpose('verify'); setCooldown(45); go('verify'); setInfo(`We sent a 6-digit code to ${email.trim().toLowerCase()}.`);
      } else if (mode === 'signin') {
        try { onAuthed(await Auth.login(email, password)); }
        catch (err) {
          if (err instanceof ApiError && err.code === 'UNVERIFIED') { setVerifyPurpose('verify'); setCooldown(45); go('verify'); setInfo('Please verify your email. We sent you a new code.'); }
          else throw err;
        }
      } else if (mode === 'verify') {
        onAuthed(await Auth.verify(email, code));
      } else if (mode === 'forgot') {
        await Auth.resend(email, 'reset');
        setVerifyPurpose('reset'); setCooldown(45); go('reset'); setInfo('If that email has an account, we sent a reset code.');
      } else if (mode === 'reset') {
        await Auth.resetPassword(email, code, password);
        go('signin'); setPassword(''); setInfo('Password updated. You can sign in now.');
      }
    });
  };

  const resend = () => run(async () => { await Auth.resend(email, verifyPurpose); setCooldown(45); setInfo('A new code is on its way.'); });

  const titles: Record<Mode, [string, string]> = {
    signin: ['Welcome back', 'Sign in to your OmniPulse workspace'],
    signup: ['Create your account', 'Start automating your content in minutes'],
    verify: ['Check your email', 'Enter the 6-digit code we sent you'],
    forgot: ['Reset your password', "We'll email you a verification code"],
    reset: ['Choose a new password', 'Enter the code we emailed you and a new password (8+ characters, with a letter and a number)'],
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md">
        {onBack && <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-4"><ArrowLeft className="w-3 h-3" /> Back to home</button>}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center"><Zap className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-bold text-white">OmniPulse AI</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {(mode === 'verify' || mode === 'forgot' || mode === 'reset') && (
            <button onClick={() => go('signin')} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-3">
              <ArrowLeft className="w-3 h-3" /> Back to sign in
            </button>
          )}
          <h1 className="text-lg font-bold text-white">{titles[mode][0]}</h1>
          <p className="text-sm text-slate-400 mb-5">{titles[mode][1]}</p>

          {info && <div role="status" className="mb-4 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">{info}</div>}
          {error && <div role="alert" className="mb-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>}

          <form onSubmit={submit} className="space-y-3" noValidate={false}>
            {mode === 'signup' && (
              <>
                <Field icon={User}><input className={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></Field>
                <Field icon={Briefcase}><input className={input} placeholder="Brand or business name (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} autoComplete="organization" /></Field>
              </>
            )}
            {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
              <Field icon={Mail}><input className={input} type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
            )}
            {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
              <Field icon={Lock}>
                <input className={input} type={showPw ? 'text' : 'password'} placeholder={mode === 'reset' ? 'New password' : 'Password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'signin' ? 1 : 8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </Field>
            )}
            {(mode === 'verify' || mode === 'reset') && (
              (
                <input className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono text-white focus:outline-none focus:border-indigo-500"
                  inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required pattern="\d{6}" aria-label="Verification code" />
              )
            )}

            {mode === 'signup' && (
              <label className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required className="mt-0.5 accent-indigo-500" />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">Privacy Policy</a>.</span>
              </label>
            )}

            <button type="submit" disabled={busy || ((mode === 'verify' || mode === 'reset') && code.length !== 6)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {{ signin: 'Sign in', signup: 'Create account', verify: verifyPurpose === 'verify' ? 'Verify & continue' : 'Continue', forgot: 'Send reset code', reset: 'Update password' }[mode]}
            </button>
          </form>

          {(mode === 'verify' || mode === 'reset') && (
            <p className="text-xs text-slate-400 text-center mt-4">
              Didn't get it?{' '}
              <button onClick={resend} disabled={cooldown > 0 || busy} className="text-indigo-400 hover:text-indigo-300 disabled:text-slate-600">
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
              <span className="block mt-1 text-slate-500">Check your spam folder too.</span>
            </p>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <div className="mt-4 text-center">
              {!showCode ? (
                <button type="button" onClick={() => setShowCode(true)} className="text-[11px] text-slate-500 hover:text-slate-300">Have an access code?</button>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); run(async () => { onAuthed(await Auth.ownerAccess(accessCode)); }); }} className="flex gap-2">
                  <input className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500" type="password" autoComplete="off" placeholder="Access code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} aria-label="Access code" required />
                  <button disabled={busy || !accessCode} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-semibold rounded-lg px-4">Enter</button>
                </form>
              )}
            </div>
          )}

          {mode === 'signin' && (
            <div className="mt-4 text-xs text-center space-y-2">
              <button onClick={() => go('forgot')} className="text-slate-400 hover:text-slate-200">Forgot your password?</button>
              <p className="text-slate-400">New here? <button onClick={() => go('signup')} className="text-indigo-400 hover:text-indigo-300 font-medium">Create an account</button></p>
            </div>
          )}
          {mode === 'signup' && (
            <p className="mt-4 text-xs text-center text-slate-400">Already have an account? <button onClick={() => go('signin')} className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</button></p>
          )}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mt-4"><ShieldCheck className="w-3 h-3" /> Secured with encrypted sessions · Payments by Flutterwave <span className="text-slate-700">· build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}</span></p>
      </div>
    </div>
  );
};

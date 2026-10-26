import React from 'react';
import { ArrowLeft } from 'lucide-react';

export const COMPANY = import.meta.env.VITE_COMPANY_NAME || 'OmniPulse AI';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@omnipulse.ai';
const UPDATED = 'October 2026';

export type LegalPage = 'terms' | 'privacy' | 'refunds';

const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-base font-bold text-white mt-6 mb-2">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-slate-300 leading-relaxed mb-2">{children}</p>;

/*
 * NOTE: These are good-faith starting templates, not legal advice. Have a lawyer in your jurisdiction
 * review them (and set VITE_COMPANY_NAME / VITE_SUPPORT_EMAIL) before you start selling.
 */
const CONTENT: Record<LegalPage, { title: string; body: React.ReactNode }> = {
  terms: {
    title: 'Terms of Service',
    body: (<>
      <P>These Terms govern your use of {COMPANY} (the "Service"). By creating an account you agree to them.</P>
      <H>1. The Service</H>
      <P>{COMPANY} helps you plan, generate and publish social media content using AI tools and third-party services including the social networks you connect, Google Gemini and fal.ai. Features may change over time.</P>
      <H>2. Your account</H>
      <P>You must provide accurate information, keep your password secure, and are responsible for activity under your account. You must be at least 18 years old.</P>
      <H>3. Subscriptions and billing</H>
      <P>Paid plans renew automatically each month or year until cancelled. You can cancel at any time in the app; access continues until the end of the paid period. Payments are processed by Flutterwave. Prices may change with advance notice. See our Refund Policy.</P>
      <H>4. Your content</H>
      <P>You own the content you create. You grant us a limited licence to process it solely to operate the Service. You are responsible for ensuring your content and posts comply with the law and with the rules of each social platform. AI output may be inaccurate; review it before publishing.</P>
      <H>5. Acceptable use</H>
      <P>Do not use the Service for unlawful, deceptive, infringing, hateful or harmful content, to spam, to impersonate others, or to attempt to disrupt or reverse-engineer the Service. We may suspend accounts that violate these Terms.</P>
      <H>6. Third-party services</H>
      <P>Publishing happens directly to the social accounts you connect and is also subject to each social network's terms. We are not responsible for their availability or policy changes.</P>
      <H>7. Disclaimers and liability</H>
      <P>The Service is provided "as is" without warranties. We do not guarantee any particular reach, engagement or revenue. To the maximum extent permitted by law, our total liability is limited to the amount you paid us in the 3 months before the claim.</P>
      <H>8. Termination</H>
      <P>You may delete your account at any time in Account settings. We may suspend or terminate access for breach of these Terms.</P>
      <H>9. Contact</H>
      <P>Questions: {SUPPORT_EMAIL}. Last updated {UPDATED}.</P>
    </>),
  },
  privacy: {
    title: 'Privacy Policy',
    body: (<>
      <P>This policy explains what {COMPANY} collects and how it is used. Last updated {UPDATED}.</P>
      <H>Information we collect</H>
      <P>Account details (name, email, brand name, hashed password), the content and settings you create in the app, subscription and payment records (we never see or store your card number; Flutterwave handles payments), and the access tokens that let us publish to your connected social accounts (stored encrypted; we never see your social passwords). Our servers also log technical data such as IP address for security and abuse prevention.</P>
      <H>How we use it</H>
      <P>To provide and secure the Service, send transactional emails (verification codes, receipts, payment notices), process payments, and improve reliability. We do not sell your personal data.</P>
      <H>Service providers</H>
      <P>We share only what is needed with: Vercel (hosting), Neon (database), Resend (email), Flutterwave (payments), the social networks you choose to connect (publishing), and Google (Gemini) and fal.ai (AI processing of the prompts and scripts you submit).</P>
      <H>Cookies</H>
      <P>We use one essential, secure session cookie to keep you signed in. We do not use advertising cookies.</P>
      <H>Your rights</H>
      <P>You can edit your profile, download a copy of your data, or permanently delete your account and data from Account settings at any time. Payment records may be retained as required by tax and accounting law. For other requests, contact {SUPPORT_EMAIL}.</P>
      <H>Security and retention</H>
      <P>Passwords are hashed, connections are encrypted in transit, and tokens are encrypted at rest. Data is kept while your account is active and deleted when you delete your account.</P>
    </>),
  },
  refunds: {
    title: 'Refund Policy',
    body: (<>
      <P>Last updated {UPDATED}.</P>
      <H>Cancellation</H>
      <P>You can cancel anytime in Plans &amp; billing. You keep access until the end of the period you have paid for, and you will not be charged again.</P>
      <H>Refunds</H>
      <P>Subscription fees are generally non-refundable once a billing period has started, and we do not offer partial refunds for unused time. If you were charged in error, charged twice, or the Service was unusable for a sustained period because of a fault on our side, contact {SUPPORT_EMAIL} within 7 days and we will make it right.</P>
      <H>Render allowances</H>
      <P>AI video renders count towards your plan's monthly allowance when a render is submitted. Renders that fail do not count.</P>
    </>),
  },
};

export const LegalView: React.FC<{ page: LegalPage; onBack: () => void }> = ({ page, onBack }) => {
  React.useEffect(() => { document.title = `${CONTENT[page].title} | ${COMPANY}`; return () => { document.title = 'OmniPulse AI: AI Video Generator & Social Media Scheduler'; }; }, [page]);
  return (
  <div className="min-h-full bg-slate-950 px-4 py-8">
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-4"><ArrowLeft className="w-3 h-3" /> Back</button>
      <h1 className="text-2xl font-bold text-white mb-4">{CONTENT[page].title}</h1>
      {CONTENT[page].body}
      <p className="text-xs text-slate-500 mt-8 pt-4 border-t border-slate-800">
        <a href="/terms" className="hover:text-slate-300">Terms</a> · <a href="/privacy" className="hover:text-slate-300">Privacy</a> · <a href="/refunds" className="hover:text-slate-300">Refunds</a>
      </p>
    </div>
  </div>
  );
};

export const LegalLinks: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={className}>
    <a href="/terms" className="hover:text-slate-300 underline-offset-2 hover:underline">Terms</a> · <a href="/privacy" className="hover:text-slate-300 underline-offset-2 hover:underline">Privacy</a> · <a href="/refunds" className="hover:text-slate-300 underline-offset-2 hover:underline">Refunds</a>
  </span>
);

import { api } from './api';
import { AppUser, SubscriptionTier } from '../types/auth';
import { SocialAccount, ScheduledPost, GeneratedVideo, ABTestExperiment, NicheCategory } from '../types';
import { emptyAccounts } from '../data/niches';

export type NicheResearch = Pick<NicheCategory, 'trendingTopics' | 'trendingCreators' | 'viralHashtags' | 'suggestedKeywords' | 'bestPractices' | 'researchSources' | 'researchGrounded'> & { fetchedAt: number };

export interface UserDashboardState {
  accounts: SocialAccount[];
  posts: ScheduledPost[];
  videos: GeneratedVideo[];
  experiments: ABTestExperiment[];
  activeNicheId: string;
  /** Cached live research per niche id. */
  research: Record<string, NicheResearch>;
}

export const emptyDashboard = (): UserDashboardState => ({
  accounts: emptyAccounts(),
  posts: [],
  videos: [],
  experiments: [],
  activeNicheId: 'ai-tools-automation',
  research: {},
});

export interface PlanInfo { id: SubscriptionTier; name: string; monthly: number; annual: number; currency: string; channels: number; videosPerMonth: number; secondsPerMonth?: number; quality?: string; available: boolean }

export const Auth = {
  async me(): Promise<AppUser | null> {
    try { return (await api.get<{ user: AppUser | null }>('/auth/me')).user; } catch { return null; }
  },
  register: (d: { name: string; email: string; password: string; brandName?: string; acceptTerms: boolean }) => api.post<{ ok: true; email: string }>('/auth/register', d),
  verify: async (email: string, code: string) => (await api.post<{ user: AppUser }>('/auth/verify', { email, code })).user,
  resend: (email: string, purpose: 'verify' | 'reset' = 'verify') => api.post('/auth/resend', { email, purpose }),
  ownerAccess: async (code: string) => (await api.post<{ user: AppUser }>('/auth/owner-access', { code })).user,
  login: async (email: string, password: string) => (await api.post<{ user: AppUser }>('/auth/login', { email, password })).user,
  resetPassword: (email: string, code: string, password: string) => api.post('/auth/reset', { email, code, password }),
  logout: () => api.post('/auth/logout').catch(() => undefined),

  plans: async () => (await api.get<{ plans: PlanInfo[] }>('/billing/plans')).plans,
  checkout: async (tier: SubscriptionTier, cycle: 'monthly' | 'annual') => (await api.post<{ url: string }>('/billing/checkout', { tier, cycle })).url,
  verifyPayment: (query: { status: string; tx_ref: string; transaction_id: string }) =>
    api.get<{ status: string; message?: string; user: AppUser }>(`/billing/verify?${new URLSearchParams(query)}`),
  checkoutTrial: async () => (await api.post<{ url: string }>('/billing/trial')).url,
  buyTopup: async (pack: string) => (await api.post<{ url: string }>('/billing/topup', { pack })).url,
  extras: () => api.get<{ currency: string; trial: { days: number; seconds: number; price: number }; topups: { id: string; seconds: number; price: number }[] }>('/billing/extras'),
  cancelSubscription: async () => (await api.post<{ user: AppUser }>('/billing/cancel')).user,

  systemCheck: async () => (await api.get<{ checks: { name: string; ok: boolean; detail: string }[] }>('/system/check')).checks,
  usage: () => api.get<{ videosUsed: number; videosLimit: number; secondsUsed: number; secondsLimit: number; topupSeconds: number }>('/account/usage'),
  updateProfile: async (name: string, brandName: string) => (await api.put<{ user: AppUser }>('/account/profile', { name, brandName })).user,
  changePassword: (currentPassword: string, newPassword: string) => api.post('/account/password', { currentPassword, newPassword }),
  exportData: () => api.get<unknown>('/account/export'),
  deleteAccount: (password: string) => api.post('/account/delete', { password }),

  async loadDashboard(): Promise<UserDashboardState> {
    const { data } = await api.get<{ data: Partial<UserDashboardState> | null }>('/dashboard');
    const base = emptyDashboard();
    const d = (data || {}) as Partial<UserDashboardState>;
    return { ...base, ...d, accounts: d.accounts?.length ? d.accounts : base.accounts, research: d.research || {} };
  },
  saveDashboard: (data: UserDashboardState) => api.put('/dashboard', { data }),
};

export type SubscriptionTier = 'starter' | 'pro' | 'agency';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  brandName: string;
  avatarUrl: string;
  tier: SubscriptionTier;
  /** none | active | canceling | past_due | canceled */
  subscriptionStatus: string;
  billingCycle: 'monthly' | 'annual' | null;
  /** True only while the subscription is paid and in good standing. */
  hasAccess: boolean;
  currentPeriodEnd: string | null;
  createdAt: string;
  channelsLimit: number;
  videosLimit: number;
  secondsLimit?: number;
  /** True while a card-verified trial is running. */
  isTrial?: boolean;
  /** True when this account can still start its one-time trial. */
  trialAvailable?: boolean;
  isVerified?: boolean;
  /** True for the owner's test-access account (no subscription needed). */
  isOwner?: boolean;
}

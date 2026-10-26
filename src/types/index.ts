export type PlatformId = 'youtube' | 'tiktok' | 'instagram' | 'x' | 'linkedin' | 'facebook' | 'pinterest';

export interface SocialAccount {
  id: PlatformId;
  name: string;
  handle: string;
  avatarUrl: string;
  connected: boolean;
  followers: number;
  growthRate: number; // e.g. +14.2%
  engagementRate: number; // e.g. 5.8%
  peakTimes: string[];
  bestFormat: string;
  autoPilotEnabled: boolean;
  oauthToken?: string;
  connectedAt?: string;
  accountEmail?: string;
  /** Server says the site owner has added this network's developer keys. */
  configured?: boolean;
  /** Publishing to this network is implemented. */
  publishable?: boolean;
}

export interface NicheCategory {
  id: string;
  name: string;
  iconName: string;
  /** Category heading used to group niches in the dropdown. */
  group?: string;
  description: string;
  audienceDemographics: string;
  avgEngagementRate: string;
  /** Web pages the latest research was based on. */
  trendingTopics: TrendingTopic[];
  /** Creators / accounts found trending in this niche by live research. */
  trendingCreators?: TrendingCreator[];
  viralHashtags: HashtagGroup;
  suggestedKeywords: string[];
  bestPractices: BestPractice[];
  /** Sources found by live web search (Google grounding). */
  researchSources?: { title: string; url: string }[];
  /** True when the research really used live web search. */
  researchGrounded?: boolean;
}

export interface TrendingCreator {
  name: string;
  handle: string;
  platform: string;
  /** Link to the profile or to the content the research found. */
  url?: string;
  /** Why this creator is trending right now. */
  whyTrending: string;
  /** The format / style of content that is working for them. */
  contentStyle: string;
  /** Concrete idea a user can borrow (not copy) for their own content. */
  takeaway: string;
  /** Example hook or post idea inspired by them. */
  exampleHook?: string;
}

export interface TrendingTopic {
  id: string;
  title: string;
  /** One sentence on why the topic is timely, from live research. */
  whyNow?: string;
  velocity: string; // e.g. "+420% this week"
  sentiment: 'Hot' | 'Rising' | 'Breakout' | 'Evergreen';
  recommendedFormat: 'TikTok/Reels 9:16' | 'YouTube 16:9' | 'Carousels' | 'Shorts';
  viralHooks: string[];
  contentAngle: string;
  estimatedReachMultiplier: string;
}

export interface HashtagItem {
  tag: string;
  volume: string; // e.g. "2.4M posts"
  competition: 'Low' | 'Medium' | 'High';
  velocityScore: number; // 1-100
  category: 'viral' | 'niche' | 'evergreen';
}

export interface HashtagGroup {
  viral: HashtagItem[];
  nicheSpecific: HashtagItem[];
  evergreen: HashtagItem[];
}

export interface BestPractice {
  title: string;
  category: 'Follower Growth' | 'Sales & Conversion' | 'Retention & Watch Time' | 'Algorithm Triggers';
  insight: string;
  actionableStep: string;
}

export type VideoType = 
  | 'ad_video' 
  | 'doodle_video' 
  | 'explainer_video'
  | 'cartoon_3d'
  | 'cartoon_2d'
  | 'real_video'
  | 'cgi_3d';

export type AspectRatioType = '9:16' | '16:9' | '1:1';
export type VideoDirectorStyle = 'dynamic_viral' | 'cinematic_commercial' | 'creator_storyteller' | 'retention_master';
export type HookFormulaStyle = 'witty_provocative' | 'contrarian' | 'viral_breakout' | 'raw_founder' | 'witty_sarcastic';
export type AIDirectorEngine = VideoDirectorStyle;
export type GrokHookStyle = HookFormulaStyle;

/** How long the production should run: Short Form (15-30s) or Long Form Narrative (1-2 min). */
export type DurationMode = 'short' | 'long';
/** Global story genre / emotion. Drives lighting, pacing, colour grade and writing tone for every scene. */
export type StoryMoodId = 'dramatic_suspense' | 'melodrama' | 'viral_hook' | 'emotional_heartfelt' | 'cinematic_trailer';
/** Directorial camera profile. Translated into a concrete cameraMotion instruction for every scene. */
export type CameraProfileId = 'slow_dramatic_zoom' | 'steady_pan' | 'static_narrative' | 'kinetic_tracking';

/** The creative brief the user configured. Sent to the script writer and stored on the finished video. */
export interface StoryBrief {
  durationMode: DurationMode;
  /** Length the user asked for, in seconds (before any plan-allowance cap). */
  requestedSeconds: number;
  /** One scene is 20 seconds (two 10 second clips) or 10 seconds. */
  sceneSeconds?: 10 | 20;
  mood: StoryMoodId;
  cameraProfile: CameraProfileId;
  /** Optional main-character lock: this descriptor is repeated in every scene so the person looks the same. */
  characterLock?: { name?: string; descriptor: string };
}

export interface VideoCharacter {
  id: string;
  name: string;
  role: string;
  gender: 'male' | 'female';
  /** Visual description repeated in every scene prompt so the character looks the same. */
  description: string;
  /** Studio voice id, or 'none' for a silent character. */
  voiceId?: string;
}

export interface SceneLine { speaker: string; text: string }

export interface VideoScene {
  id: string;
  /** Multi-character productions: what each character says in this scene. */
  lines?: SceneLine[];
  /** Multi-character productions: the rendered clip for this scene. */
  clipUrl?: string;
  /** The render job of this scene's clip. Used to download or join the scenes. */
  clipJobId?: string;
  visualPrompt?: string;
  /** Spoken words of this scene (narration and dialogue, without speaker names). */
  voiceoverText?: string;
  /** The camera instruction this scene was rendered with. */
  cameraMotion?: string;
  /** Story beat of this scene, e.g. "Hook" or "Climax". */
  beat?: string;
  sceneNumber: number;
  duration: number; // seconds
  visualCue: string;
  narration: string;
  onScreenText: string;
  soundEffectCue: string;
  motionStyle: 'Dynamic Zoom' | 'Hand Sketch Draw' | 'Kinetic Kinetic Typography' | 'Isometric Pan';
  bgGradient: string;
  iconSymbol?: string;
}

export interface GeneratedVideo {
  id: string;
  title: string;
  userPrompt: string;
  videoType: VideoType;
  aspectRatio: AspectRatioType;
  targetPlatforms: PlatformId[];
  nicheId: string;
  estimatedDuration: number;
  scenes: VideoScene[];
  /** Set for drama, documentary and animation productions with several voices. */
  characters?: VideoCharacter[];
  format?: 'drama' | 'documentary' | 'animation';
  /** Creative settings the production was made with (duration, mood, camera, character lock). */
  brief?: StoryBrief & { targetSeconds: number };
  voiceoverStyle: string;
  backgroundMusicTrack: string;
  thumbnailUrl: string;
  videoUrl?: string;
  createdAt: string;
  status: 'ready' | 'rendering' | 'scheduled' | 'published';
  directorStyle?: VideoDirectorStyle;
  hookFormula?: HookFormulaStyle;
  aiDirectorEngine?: AIDirectorEngine;
  grokHookStyle?: GrokHookStyle;
  voiceId?: string;
  voiceName?: string;
  voiceMomentum?: number;
  voiceQuality?: string;
  hashtags?: string[];
  soundDesignBadge?: string;
  callToAction?: string;
}

export interface ScheduledPost {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  platforms: PlatformId[];
  mediaType: 'video' | 'image' | 'carousel';
  mediaUrl?: string;
  videoRefId?: string;
  scheduledTime: string; // ISO string
  status: 'draft' | 'scheduled' | 'publishing' | 'published';
  autoPeakOptimized: boolean;
  /** IDs returned by each network when this post was published, used to read real metrics later. */
  publishedPosts?: { postId: string; platform: string; name: string }[];
  metrics?: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
    ctr: number;
  };
}

export interface NicheAutoPilotSettings {
  enabled: boolean;
  frequency: 'daily' | 'twice_daily' | 'weekly' | 'custom';
  videosPerBatch: number;
  preferredStyle: VideoType;
  customTimeSlot: string; // e.g. "18:30"
  targetPlatforms: PlatformId[];
  autoResearchTrending: boolean;
  lastAutonomousRun?: string;
}



export interface ABVariant {
  hook: string;
  caption: string;
  thumbnailDesc: string;
  /** Network post ID once the variant has been published. */
  postId?: string;
  channelId?: string;
  impressions?: number;
  engagements?: number;
}

export interface ABTestExperiment {
  id: string;
  name: string;
  targetPlatform: PlatformId;
  createdAt: string;
  hypothesis: string;
  strategicReasoning: string;
  videoRefId?: string;
  status: 'draft' | 'running' | 'completed';
  variantA: ABVariant;
  variantB: ABVariant;
  resultsSource?: 'network' | 'manual';
  winningVariant?: 'A' | 'B';
  confidenceRate?: number;
}

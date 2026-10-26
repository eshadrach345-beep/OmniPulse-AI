export interface StudioVoice {
  id: string;
  name: string;
  speakerName: string;
  gender: 'male' | 'female';
  voiceType: 'commercial_ad' | 'viral_short' | 'storyteller' | 'explainer_tech' | 'conversational';
  description: string;
  accent: string;
  age: string;
  useCase: string;
  previewText: string;
  recommendedMomentum: number;
  recommendedStability: number;
  recommendedClarity: number;
  qualityBadge: string;
}

// Backwards compatibility alias
export type ElevenLabsVoice = StudioVoice;

export const STUDIO_VOICES: StudioVoice[] = [
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    speakerName: 'Adam (Deep Commercial & Authoritative Male)',
    gender: 'male',
    voiceType: 'commercial_ad',
    description: 'Resonant, authoritative, deep American male tone. The industry gold standard for high-trust commercial ads, tech keynotes, and bold hooks.',
    accent: 'American (Neutral)',
    age: 'Middle Aged',
    useCase: 'Commercial Ads, Brand Storytelling, Keynotes',
    previewText: 'Most creators spend fifteen hours editing videos for three hundred views. Here is the automated pipeline.',
    recommendedMomentum: 1.05,
    recommendedStability: 0.75,
    recommendedClarity: 0.85,
    qualityBadge: 'AI Studio Voice',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    speakerName: 'Sarah (Mature, Reassuring & High-Trust Female)',
    gender: 'female',
    voiceType: 'commercial_ad',
    description: 'Warm, clear, natural American female voice. High trust score, perfectly suited for DTC e-commerce ads, lifestyle reels, and software product breakdowns.',
    accent: 'American (Neutral)',
    age: 'Young Adult',
    useCase: 'DTC Ads, Lifestyle Reels, Product Overviews',
    previewText: 'If you want to save ten hours every single week, stop doing your video scheduling manually right now.',
    recommendedMomentum: 1.10,
    recommendedStability: 0.70,
    recommendedClarity: 0.90,
    qualityBadge: 'AI Studio Voice',
  },
  {
    id: 'iP95p4xoKVk53GoZ742B',
    name: 'Chris',
    speakerName: 'Chris (Charming & High-Retention Viral Male)',
    gender: 'male',
    voiceType: 'viral_short',
    description: 'Natural, charismatic, confident American male voice. Exceptional retention curve on TikTok, Instagram Reels, and YouTube Shorts.',
    accent: 'American (Neutral)',
    age: 'Young Adult',
    useCase: 'Viral Video Shorts, Pattern Interrupts, Trend Breakdowns',
    previewText: 'Stop wasting hours on manual editing. OmniPulse generates and renders your video in seconds.',
    recommendedMomentum: 1.15,
    recommendedStability: 0.72,
    recommendedClarity: 0.88,
    qualityBadge: 'AI Studio Voice',
  },
  {
    id: 'Xb7hH8MSUJpSbSDYk0k2',
    name: 'Alice',
    speakerName: 'Alice (Clear & Engaging Educator Female)',
    gender: 'female',
    voiceType: 'explainer_tech',
    description: 'Clear, engaging, articulate American female voice. Perfect for tutorials, educational carousels, SaaS walkthroughs, and step-by-step guides.',
    accent: 'American (Neutral)',
    age: 'Young Adult',
    useCase: 'Tutorials, SaaS Walkthroughs, Educational Reels',
    previewText: 'Here is a simple step-by-step formula you can use to plan your content this month.',
    recommendedMomentum: 1.12,
    recommendedStability: 0.75,
    recommendedClarity: 0.92,
    qualityBadge: 'AI Studio Voice',
  },
  {
    id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian',
    speakerName: 'Brian (Deep, Resonant & Comforting Male)',
    gender: 'male',
    voiceType: 'storyteller',
    description: 'Deep, cinematic baritone voice. Creates instant gravitas, dramatic tension, and credibility for disruptive brand manifestos.',
    accent: 'American (Deep)',
    age: 'Middle Aged',
    useCase: 'Cinematic Teasers, Brand Documentaries, Motivational Ads',
    previewText: 'They said building an automated audience in thirty days was impossible. They were wrong.',
    recommendedMomentum: 1.00,
    recommendedStability: 0.85,
    recommendedClarity: 0.88,
    qualityBadge: 'AI Studio Voice',
  },
  {
    id: 'hpp4J3VqNfWAUOO0d1Us',
    name: 'Bella',
    speakerName: 'Bella (Dynamic Expressive Tech Female)',
    gender: 'female',
    voiceType: 'explainer_tech',
    description: 'Crisp, articulate, dynamic young female voice. Delivers technical explanations with infectious energy and effortless authority.',
    accent: 'American (West Coast)',
    age: 'Young Adult',
    useCase: 'Software Demos, Feature Announcements, Product Launches',
    previewText: 'Watch what happens when we automate three hours of manual video scheduling with a single click.',
    recommendedMomentum: 1.15,
    recommendedStability: 0.75,
    recommendedClarity: 0.92,
    qualityBadge: 'AI Studio Voice',
  },
  {
    id: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie',
    speakerName: 'Charlie (Deep, Confident & Energetic Male)',
    gender: 'male',
    voiceType: 'conversational',
    description: 'Energetic, punchy, confident male voice with a modern creator cadence. Ideal for fast-paced reels and conversational storytelling.',
    accent: 'American (Neutral)',
    age: 'Young Adult',
    useCase: 'Creator Teardowns, Behind The Scenes, Organic Hooks',
    previewText: 'Nobody in your industry is talking about how this one simple framework is changing everything.',
    recommendedMomentum: 1.18,
    recommendedStability: 0.68,
    recommendedClarity: 0.88,
    qualityBadge: 'AI Studio Voice',
  },
  {
    id: 'cgSgspJ2msm6clMCkdW9',
    name: 'Jessica',
    speakerName: 'Jessica (Playful, Bright & Relatable Female)',
    gender: 'female',
    voiceType: 'conversational',
    description: 'Friendly, relatable, organic female creator delivery. Sounds like an organic viral creator talking directly to a friend.',
    accent: 'American',
    age: 'Young Adult',
    useCase: 'UGC Style Ads, Lifestyle Shorts, Personal Brand Content',
    previewText: 'I almost gave up trying to figure out social algorithms until I discovered this exact blueprint.',
    recommendedMomentum: 1.14,
    recommendedStability: 0.70,
    recommendedClarity: 0.86,
    qualityBadge: 'AI Studio Voice',
  },
];

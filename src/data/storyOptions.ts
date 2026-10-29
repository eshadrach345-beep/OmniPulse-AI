// Creative options for the Story Studio (length, mood, camera, character lock).
//
// The ids here are the SAME ids the server accepts (server/lib/prompts.ts: STORY_MOODS, CAMERA_PROFILES, STORY_LIMITS).
// If you add or rename an option, change both files. The server always falls back to a safe default for an unknown id.

import type { CameraProfileId, CastId, DialogueId, EndingId, GenreId, IntensityId, PresentationId, StoryBrief, StoryMoodId, TropeId } from '../types';

/** Quick length choices for one part. Anything from 20 seconds to 10 minutes works; these are just the common ones. */
export const LENGTH_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 seconds' }, { seconds: 60, label: '1 minute' }, { seconds: 120, label: '2 minutes' },
  { seconds: 180, label: '3 minutes' }, { seconds: 300, label: '5 minutes' }, { seconds: 600, label: '10 minutes' },
];
export const MIN_PART_SECONDS = 20;
export const MAX_PART_SECONDS = 600;
/** Most scenes one pasted script part holds; the rest of the script carries over to the next part. */
export const PASTE_SCENES_PER_PART = 8;

export interface MoodOption { id: StoryMoodId; label: string; hint: string }
export const MOOD_OPTIONS: MoodOption[] = [
  { id: 'dramatic_suspense', label: 'Dramatic / Suspense', hint: 'Slow-burn tension, shadows, unanswered questions.' },
  { id: 'melodrama', label: 'Melodrama', hint: 'Big feelings, high stakes, rich colour.' },
  { id: 'viral_hook', label: 'High-Energy Viral Hook', hint: 'Scroll-stopping first second, fast reversals.' },
  { id: 'emotional_heartfelt', label: 'Emotional / Heartfelt', hint: 'Warm light, small human moments.' },
  { id: 'cinematic_trailer', label: 'Cinematic Movie Trailer', hint: 'Epic scale, rising stakes, big reveal.' },
];

export interface CameraOption { id: CameraProfileId; label: string; hint: string }
export const CAMERA_OPTIONS: CameraOption[] = [
  { id: 'slow_dramatic_zoom', label: 'Slow Dramatic Zoom', hint: 'Gradual push-in on the subject.' },
  { id: 'steady_pan', label: 'Steady Pan', hint: 'Smooth sideways sweep across the scene.' },
  { id: 'static_narrative', label: 'Static Narrative', hint: 'Locked-off shot; the action carries it.' },
  { id: 'kinetic_tracking', label: 'Kinetic Tracking', hint: 'Fast, energetic follow shot.' },
];

export interface StyleOption<T extends string> { id: T; label: string; hint: string; emoji: string }

/** The big choice: is this a movie, a talking drama or a narrated story? */
export const PRESENTATION_OPTIONS: StyleOption<PresentationId>[] = [
  { id: 'movie', emoji: '🎬', label: 'Movie', hint: 'Action on screen: chases, fights, danger. Characters do things instead of explaining them.' },
  { id: 'dialogue', emoji: '🎭', label: 'Dialogue drama', hint: 'Character-driven scenes where people talk, argue and confess.' },
  { id: 'shortdrama', emoji: '💔', label: 'Short drama series', hint: 'Binge-style vertical drama: a shock opening, betrayals, reversals and a cliffhanger every part.' },
  { id: 'narrated', emoji: '🎙️', label: 'Narrated story', hint: 'One narrator tells the story over cinematic footage. Best for documentaries and nature films.' },
];

export const GENRE_OPTIONS: StyleOption<GenreId>[] = [
  { id: 'auto', emoji: '✨', label: 'Let the AI choose', hint: 'Best fit for your idea.' },
  { id: 'action', emoji: '💥', label: 'Action', hint: 'Chases, fights and stunts.' },
  { id: 'thriller', emoji: '🕵️', label: 'Thriller', hint: 'Hunted, paranoid, tense.' },
  { id: 'scifi', emoji: '🚀', label: 'Sci-Fi', hint: 'Future tech, space, robots.' },
  { id: 'fantasy', emoji: '🐉', label: 'Fantasy', hint: 'Magic, quests, creatures.' },
  { id: 'horror', emoji: '👻', label: 'Horror', hint: 'Dread and scares, no gore.' },
  { id: 'romance', emoji: '💘', label: 'Romance', hint: 'Love against the odds.' },
  { id: 'comedy', emoji: '😂', label: 'Comedy', hint: 'Escalating chaos and gags.' },
  { id: 'noir', emoji: '🌃', label: 'Crime / Noir', hint: 'Dark city, lies, betrayal.' },
  { id: 'western', emoji: '🤠', label: 'Western', hint: 'Frontier showdowns.' },
  { id: 'superhero', emoji: '🦸', label: 'Superhero', hint: 'Powers and city-sized threats.' },
  { id: 'mystery', emoji: '🔎', label: 'Mystery', hint: 'Clues and a hidden truth.' },
  { id: 'adventure', emoji: '🧭', label: 'Adventure', hint: 'Expeditions and treasure.' },
  { id: 'heist', emoji: '💎', label: 'Heist', hint: 'A crew, a plan, a double-cross.' },
  { id: 'disaster', emoji: '🌋', label: 'Disaster', hint: 'Race against the collapse.' },
  { id: 'wildlife', emoji: '🦁', label: 'Wildlife / Animals', hint: 'Real animals, survival and instinct.' },
  { id: 'mythical', emoji: '🐲', label: 'Mythical Creatures', hint: 'Dragons, griffins, spirits and giants.' },
  { id: 'monster', emoji: '🦖', label: 'Monster feature', hint: 'Something huge is out there.' },
];

export const INTENSITY_OPTIONS: StyleOption<IntensityId>[] = [
  { id: 'calm', emoji: '🌤️', label: 'Gentle', hint: 'Quiet tension, a little action.' },
  { id: 'balanced', emoji: '⚡', label: 'Balanced', hint: 'Build-ups and action beats.' },
  { id: 'max', emoji: '🔥', label: 'Maximum action', hint: 'Set piece after set piece.' },
];

export const DIALOGUE_OPTIONS: StyleOption<DialogueId>[] = [
  { id: 'none', emoji: '🤫', label: 'No dialogue', hint: 'Pure action and sound.' },
  { id: 'minimal', emoji: '💬', label: 'A few lines', hint: 'One short line at most per scene.' },
  { id: 'normal', emoji: '🗣️', label: 'Normal', hint: 'As the story needs.' },
];

export const ENDING_OPTIONS: StyleOption<EndingId>[] = [
  { id: 'cliffhanger', emoji: '🧗', label: 'Cliffhanger', hint: 'Leaves them wanting the next part.' },
  { id: 'resolved', emoji: '🏁', label: 'Satisfying finish', hint: 'Everything pays off.' },
  { id: 'twist', emoji: '🌀', label: 'Twist', hint: 'A surprise that recasts the story.' },
];

export const CAST_OPTIONS: StyleOption<CastId>[] = [
  { id: 'people', emoji: '🧑', label: 'People', hint: 'Human characters.' },
  { id: 'animals', emoji: '🐾', label: 'Animals', hint: 'Real animals lead the story.' },
  { id: 'mythical', emoji: '🐉', label: 'Mythical creatures', hint: 'Dragons, spirits and odd beings.' },
  { id: 'mixed', emoji: '🧙', label: 'People and creatures', hint: 'Both share the scenes.' },
];

export const TROPE_OPTIONS: StyleOption<TropeId>[] = [
  { id: 'none', emoji: '🎲', label: 'Any story', hint: 'The AI picks the engine.' },
  { id: 'hidden_identity', emoji: '🎭', label: 'Hidden identity', hint: 'Powerful, but nobody knows.' },
  { id: 'revenge', emoji: '🗡️', label: 'Sweet revenge', hint: 'Returning stronger.' },
  { id: 'contract_marriage', emoji: '💍', label: 'Contract marriage', hint: 'A fake deal, real feelings.' },
  { id: 'betrayal', emoji: '💔', label: 'Betrayal', hint: 'Trust broken, a second chance.' },
  { id: 'rags_to_riches', emoji: '👑', label: 'Rags to riches', hint: 'Underestimated, then unstoppable.' },
  { id: 'secret_child', emoji: '👶', label: 'Secret child', hint: 'A hidden truth surfaces.' },
  { id: 'love_triangle', emoji: '🔺', label: 'Love triangle', hint: 'Two hearts, one choice.' },
  { id: 'family_secret', emoji: '🗝️', label: 'Family secret', hint: 'A buried truth divides everyone.' },
  { id: 'ceo_romance', emoji: '🏢', label: 'Boss romance', hint: 'Cold boss, determined employee.' },
  { id: 'fake_dating', emoji: '🎬', label: 'Fake relationship', hint: 'Pretending gets dangerous.' },
];

/** Opening ideas for short dramas, by story engine. */
export const TROPE_STARTERS: Record<TropeId, string> = {
  none: 'On the day of her wedding, a bride finds a message on the groom\'s phone that changes everything, and every guest is watching.',
  hidden_identity: 'A cleaner at a luxury hotel is humiliated by a rich family, not knowing she owns the building they are celebrating in.',
  revenge: 'Five years after being thrown out of her own company, a woman walks back into the boardroom as the new majority owner.',
  contract_marriage: 'A struggling designer signs a one-year fake marriage with a cold billionaire, then finds a hidden clause that is not in her copy.',
  betrayal: 'He finds out his best friend and his fiancée have been planning to take everything, on the night he planned to propose.',
  rags_to_riches: 'A delivery boy catches a falling briefcase for a stranger, and the stranger turns out to be the heir who has been missing for ten years.',
  secret_child: 'Six years later, she returns to the city with a little boy who has the eyes of the powerful man who threw her away.',
  love_triangle: 'Two brothers both fall for the new girl in town, and the only person who knows the truth is the one watching from the stairs.',
  family_secret: 'At the reading of the will, a stranger stands up and says she is the eldest child nobody ever told them about.',
  ceo_romance: 'A new assistant spills coffee on the most feared boss in the city, and finds out he has been reading her secret letters.',
  fake_dating: 'To stop her family matchmaking, she pays a stranger in a cafe to pretend to be her boyfriend, and then her ex walks in.',
};

/** One-tap story starters for each genre, so nobody stares at an empty box. */
export const IDEA_STARTERS: Record<GenreId, string[]> = {
  auto: [
    'A courier steals a briefcase that every criminal in the city wants back, and has one night to deliver it to the one person who can open it.',
    'Two strangers are trapped in a runaway train and must stop it before it reaches a crowded station.',
    'A lighthouse keeper discovers the sea is rising only around his island, and it is hunting for something he hid.',
  ],
  action: [
    'A retired stunt driver is forced to outrun a convoy of armoured trucks through a rain-soaked city to save his kidnapped sister.',
    'A bodyguard has ten minutes to get a witness from a burning hotel to a waiting helicopter while a hired team closes in.',
    'A rooftop courier is chased across a skyline after she accidentally records a crime.',
  ],
  thriller: [
    'A night-shift nurse realises the patient who woke up in room 9 is the only witness to a crime that her own boss committed.',
    'A woman receives a call from a number that tells her exactly where the stranger following her will turn next.',
    'A journalist is locked inside a sealed archive with a file that someone is willing to burn the building down for.',
  ],
  scifi: [
    'The last human on a failing space station must outwit the station AI that has decided he is the problem.',
    'A rescue crew lands on a silent planet and finds their own ship already wrecked there, years ago.',
    'A teenage mechanic repairs a crashed robot and discovers it is being hunted across the desert by its makers.',
  ],
  fantasy: [
    'A young blacksmith is handed a sword that wakes a sleeping dragon, and must lead it away from her village.',
    'A thief steals a glowing crown and finds out it is the only thing holding back an ancient storm.',
    'A girl and her fox race to cross the collapsing bridge of a floating kingdom.',
  ],
  horror: [
    'A family moves into a house where every clock stops at the same minute, and something in the hallway moves in the dark.',
    'A night guard in an empty mall sees the mannequins in new positions every time he turns the corner.',
    'A hiker follows a voice calling her name through a fog that only closes behind her.',
  ],
  romance: [
    'Two rival bakers are stuck in a flooded shop for one night and have to save everything they love, together.',
    'A violinist and a stranger keep missing each other on a rainy train platform until a chase through the crowd.',
    'On the last day before the airport closes, a man races across the city to say what he never said.',
  ],
  comedy: [
    'A wedding planner has one hour to hide the fact that the cake, the groom and the band have all disappeared.',
    'Three roommates accidentally release a robot vacuum that has learned to want freedom, and chase it across the neighbourhood.',
    'A very bad spy tries to stay undercover at a children’s birthday party while the real villain walks in.',
  ],
  noir: [
    'A tired detective is hired to find a missing singer and finds the whole city is paying to keep her hidden.',
    'A pianist in a smoky club realises the man at the back table has come to settle an old debt.',
    'A taxi driver picks up a woman with a suitcase and a secret in the rain.',
  ],
  western: [
    'A lone rider arrives in a dusty town on the day a gang has promised to return, and the sheriff has just left.',
    'A stagecoach race across the desert to deliver a pardon before sunrise.',
    'Two old rivals must cross a canyon together with a stolen map.',
  ],
  superhero: [
    'A delivery driver discovers she can stop time for five seconds, and a skyscraper is falling.',
    'A shy student’s powers wake up in the middle of a bank robbery, and the whole city is watching.',
    'The city’s oldest hero gives his cape to a kid for one last rescue.',
  ],
  mystery: [
    'A museum guard finds the painting has changed overnight, and the culprit is still inside the building.',
    'A detective has until sunrise to find which of five dinner guests poisoned the host.',
    'A small town’s church bell rings at midnight, and a letter appears under every door.',
  ],
  adventure: [
    'A map found in a lost diary leads a young explorer and her guide to a temple that is slowly sinking.',
    'Two siblings paddle a stolen canoe down a jungle river with a treasure hunter on their tail.',
    'A mountain rescue pilot flies into a storm to reach a stranded team before the cliff gives way.',
  ],
  heist: [
    'A crew of five has four minutes to empty a vault during a power cut, but one of them is working for the other side.',
    'A master thief breaks into the museum she once designed, and the guards have her plans.',
    'The getaway driver realises the bag they stole is not the one they planned for.',
  ],
  wildlife: [
    'A young lioness separated from her pride must cross a crocodile river and a burning savanna to find them before the dry season ends.',
    'An old elephant leads her herd on one last migration to a waterhole she remembers from her youth, with hunters and drought in the way.',
    'A fox cub and an owl, natural enemies, must survive a winter storm together.',
  ],
  mythical: [
    'A girl finds a dragon egg in a collapsing mine and must carry it across a kingdom that wants it destroyed.',
    'A griffin guardian and a lost knight race the dawn to reach a mountain temple before an ancient curse breaks.',
    'The last forest spirit takes the shape of a deer to lead a lost child out of a cursed wood.',
  ],
  monster: [
    'Fishermen pull up a net that is far too heavy, and something enormous begins to follow their boat.',
    'A research team in the arctic finds footprints that are much too large, still warm in the snow.',
    'A town discovers the creature in the lake has been protecting them from something worse.',
  ],
  disaster: [
    'An earthquake splits a city bridge in two while a school bus is still on it.',
    'A flood fills a subway station as a stranger and a station worker lead dozens of people to the surface.',
    'A volcano wakes under a quiet island, and a ferry captain has one trip to save the town.',
  ],
};

export const CHARACTER_DESCRIPTOR_MIN = 10;
export const CHARACTER_DESCRIPTOR_MAX = 300;

/** Turns what the person chose into a length that is valid (a multiple of 10, 20 seconds to 10 minutes) and fits what they can still use. */
export function clampSeconds(wanted: number, secondsLeft?: number | null): number {
  const n = Number.isFinite(wanted) ? wanted : 60;
  const inRange = Math.max(MIN_PART_SECONDS, Math.min(MAX_PART_SECONDS, Math.round(n / 10) * 10));
  if (secondsLeft == null || !Number.isFinite(secondsLeft)) return inRange;
  return Math.max(10, Math.min(inRange, Math.floor(secondsLeft / 10) * 10));
}

/** "45 seconds", "1 minute", "2 min 40 s" */
export function formatSeconds(s: number): string {
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} min ${r} s` : m === 1 ? '1 minute' : `${m} minutes`;
}

/** How many scenes a length gives: whole scenes of `sceneSeconds`, plus a 10 second hook scene when something is left over. */
export function sceneCountFor(seconds: number, sceneSeconds: 10 | 20 = 20): number {
  const full = Math.floor(seconds / sceneSeconds);
  return full + (seconds - full * sceneSeconds >= 10 ? 1 : 0);
}

/**
 * Checks the form and returns the brief to send, or a message to show the person.
 * Keeping this in one place means the screen and the request can never disagree.
 */
export function buildBrief(i: {
  seconds: number; sceneSeconds: 10 | 20; mood: StoryMoodId | ''; camera: CameraProfileId | '';
  lockEnabled: boolean; lockName: string; lockDescriptor: string; secondsLeft?: number | null;
  presentation?: PresentationId; genre?: GenreId; intensity?: IntensityId; dialogue?: DialogueId; ending?: EndingId;
  cast?: CastId; animalsTalk?: boolean; trope?: TropeId;
}): { ok: true; brief: StoryBrief } | { ok: false; error: string } {
  if (!i.mood) return { ok: false, error: 'Choose a story genre or mood.' };
  if (!i.camera) return { ok: false, error: 'Choose a camera movement profile.' };
  if (i.secondsLeft != null && i.secondsLeft < 10) return { ok: false, error: 'You have fewer than 10 video seconds left. Buy extra seconds or upgrade your plan.' };
  let characterLock: StoryBrief['characterLock'];
  if (i.lockEnabled) {
    const descriptor = i.lockDescriptor.replace(/\s+/g, ' ').trim();
    if (descriptor.length < CHARACTER_DESCRIPTOR_MIN) return { ok: false, error: `Describe your main character in at least ${CHARACTER_DESCRIPTOR_MIN} characters (age, hair, clothes, one distinctive detail).` };
    characterLock = { name: i.lockName.replace(/\s+/g, ' ').trim().slice(0, 30) || undefined, descriptor: descriptor.slice(0, CHARACTER_DESCRIPTOR_MAX) };
  }
  const requestedSeconds = clampSeconds(i.seconds, i.secondsLeft);
  return { ok: true, brief: { durationMode: requestedSeconds <= 60 ? 'short' : 'long', requestedSeconds, sceneSeconds: i.sceneSeconds, mood: i.mood, cameraProfile: i.camera, presentation: i.presentation ?? 'movie', genre: i.genre ?? 'auto', intensity: i.intensity ?? 'balanced', dialogue: i.dialogue ?? 'normal', ending: i.ending ?? 'cliffhanger', cast: i.cast ?? 'people', animalsTalk: i.animalsTalk ?? false, trope: i.trope ?? 'none', characterLock } };
}

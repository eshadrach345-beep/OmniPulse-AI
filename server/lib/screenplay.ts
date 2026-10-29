// Screenplay intelligence: decides what a character SAYS and what the camera SHOWS.
// Pure functions with no network or database, so they can be tested on their own.
//
// The problem this solves: a story line such as "The lion fell." is an ACTION. In a real film the lion falls and nobody says it.
// Earlier versions read every sentence aloud with a narrator, which looks like a school play. These helpers keep speech for speech
// and turn descriptions into something the actors and the camera do.

export interface SpokenLine { speaker: string; text: string; half: number; emotion?: string; doing?: string }

const FIRST_SECOND_PERSON = /\b(i|i'm|i'll|i've|i'd|me|my|mine|myself|we|we're|we'll|us|our|you|you're|you'll|you've|your|yours|let's|lets|ya|y'all)\b/i;

// Verbs for things a body or an object physically DOES. Feelings and opinions (loves, hated, believes) are not in this list on purpose:
// "Mara hates this place." can be real speech, while "Mara opens the door." is always a stage direction.
const PHYSICAL_STEMS = 'open|close|run|walk|grab|turn|stand|sit|look|enter|leave|pick|throw|pull|push|kick|jump|climb|fall|drop|slam|smile|nod|shrug|step|move|reach|take|put|hold|lift|raise|lower|hit|slap|punch|hug|kiss|stare|glance|storm|rush|hurry|cross|approach|follow|disappear|appear|crash|break|shatter|collapse|burst|slip|trip|stumble|spin|swing|roll|slide|snap|shake|tremble|freeze|duck|dodge|chase|escape|fight|attack|strike|shoot|fire|explode|burn|flee|hide|swim|fly|dive|land|rise|wake|bite|growl|roar|leap|pounce|charge|trample|gallop|crawl|knock|bang|ring|wave|point|clap|cry|laugh|scream|gasp|faint|kneel|bow|sprint|race|drive|ride|steer|brake|swerve|skid|tumble|topple|lunge|tackle|grip|clutch|squeeze|release|wipe|tear|rip|cut|stab|drag|carry|toss|hurl|flick|press|pour|spill|splash|drip|bark|howl|hiss|flap|stalk|prowl|lurch|sway|buckle|sink|float|shiver|blink|wince|flinch|sigh|swallow|inhale|exhale';
const IRREGULAR_PAST = 'fell|ran|stood|sat|took|threw|broke|fought|hit|drove|rode|shot|struck|swam|flew|slid|swung|caught|dove|hid|bit|tore|rang|shook|rose|woke|lit|led|left|held|knelt|froze|spun|stole|sank|sprang|sprinted|burst|cut|dug|hung|slipped|tripped|crashed|snapped|dropped|stumbled';
const stemAlt = PHYSICAL_STEMS.split('|').map((x) => `${x}${x.slice(-1)}?(?:s|es|ed|d|ing)?|${x.replace(/e$/, '')}ing`).join('|');
const PHYSICAL = new RegExp(`^(?:${stemAlt}|${IRREGULAR_PAST})$`, 'i');
const AUX = /^(was|were|is|are|has|had|have|been|be|being|not|never|always|will|would|could|should|can|did|does|do)$/i;

const wordsOf = (t: string) => t.trim().split(/\s+/).filter(Boolean);
const clean = (t: string) => t.replace(/^["“”'`]+|["“”'`]+$/g, '').trim();
const letters = (x = '') => x.replace(/[^A-Za-z']/g, '');

/**
 * True when a "spoken" line is really a description of something that happens (an action, a stage direction), not words a person says.
 * Actions: "The lion fell.", "Mara opens the door.", "She was running toward the gate.", "His hand shook."
 * Real speech: "He fell!", "Mara, open the door.", "I saw the lion fall.", "Did the lion fall?", "Mara hates this place."
 * It is deliberately careful: when unsure it keeps the line as speech, because losing real dialogue is worse than keeping a stiff line.
 */
export function isStageDirection(text: string, speaker: string, names: string[] = []): boolean {
  const t = clean(text);
  if (!t) return false;
  const w = wordsOf(t);
  if (w.length > 40 || w.length < 2) return false;
  if (/[?!]\s*$/.test(t)) return false; // questions and shouts are speech
  if (FIRST_SECOND_PERSON.test(t)) return false; // people talk about themselves and to each other
  if (/^[A-Za-z' -]{1,20},/.test(t)) return false; // direct address: "Mara, open the door"
  if (/[“"].+[”"]/.test(t)) return false;
  const tok = w.map((x) => letters(x));
  const first = tok[0].toLowerCase();

  // he / she / they / it  +  verb      ("He fell." "She was running toward the gate.")
  if (/^(he|she|they|it)$/.test(first)) {
    if (PHYSICAL.test(tok[1] || '') && !AUX.test(tok[1])) return true;
    if (/^(was|were|is|are)$/i.test(tok[1] || '') && /^[a-z]{2,}ing$/i.test(tok[2] || '') && PHYSICAL.test(tok[2])) return true;
    return false;
  }
  // a name  +  verb     ("Mara opens the door.")
  const nameSet = new Set([...names, speaker].filter(Boolean).map((n) => n.toLowerCase().split(' ')[0]));
  if (nameSet.has(first)) {
    if (PHYSICAL.test(tok[1] || '') && !AUX.test(tok[1])) return true;
    if (/^(and)$/i.test(tok[1] || '') && nameSet.has((tok[2] || '').toLowerCase()) && PHYSICAL.test(tok[3] || '')) return true;
    if (/^(was|were|is|are)$/i.test(tok[1] || '') && /^[a-z]{2,}ing$/i.test(tok[2] || '') && PHYSICAL.test(tok[2])) return true;
    return false;
  }
  // article or possessive + a short noun phrase + verb     ("The lion fell." "A door slams." "His hand shook.")
  if (/^(the|a|an|his|her|their|its)$/.test(first)) {
    for (let i = 2; i <= Math.min(4, tok.length - 1); i++) {
      if (PHYSICAL.test(tok[i] || '') && !AUX.test(tok[i - 1] || '') && !AUX.test(tok[i] || '')) return true;
    }
  }
  return false;
}

const TIME_OR_PLACE_JUMP = /^(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a few|several|many)\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?)\s+(?:later|earlier|before|ago)|meanwhile|that (?:night|morning|evening|day)|the (?:next|following) (?:day|morning|night|evening)|later that|earlier that|back (?:at|in|on)|at the same time|once upon a time|long ago|in the beginning)/i;

/** A real narrator line: a short time or place jump ("Three years later."). Anything longer or descriptive is better shown. */
export function isTimeOrPlaceJump(text: string): boolean {
  const t = clean(text);
  return wordsOf(t).length <= 14 && TIME_OR_PLACE_JUMP.test(t);
}

export interface NarrationPolicy {
  /** A narrated story or documentary lets the narrator carry the story. */
  narratorCarriesStory: boolean;
  /** How many scenes there are in this part. */
  scenes: number;
}

export interface RefinedScene { lines: SpokenLine[]; shown: string[] }

/**
 * Cleans one scene's lines.
 *  - A line that is really an action is removed from speech and returned in `shown`, so the video shows it instead.
 *  - Narration is kept only where a film would use it: the opening, a time or place jump, or the close. Other narration is shown, not said.
 * `state.narratorLines` is shared across a part's scenes, so the total stays small.
 */
export function refineScene(lines: SpokenLine[], opts: { sceneIndex: number; policy: NarrationPolicy; names: string[]; state: { narratorLines: number } }): RefinedScene {
  const { sceneIndex, policy, names, state } = opts;
  const kept: SpokenLine[] = [];
  const shown: string[] = [];
  const last = sceneIndex === policy.scenes - 1;
  const budget = policy.narratorCarriesStory ? Infinity : Math.max(2, Math.ceil(policy.scenes / 4));
  const seen = new Set<string>();

  for (const l of lines) {
    const text = clean(l.text);
    if (!text) continue;
    const key = `${l.speaker.toLowerCase()}|${text.toLowerCase().replace(/[^a-z0-9 ]/g, '')}`;
    if (seen.has(key)) continue; // the same line twice makes no sense
    seen.add(key);

    if (l.speaker.toLowerCase() === 'narrator') {
      if (policy.narratorCarriesStory) { kept.push({ ...l, text }); continue; }
      const allowed = state.narratorLines < budget && (sceneIndex === 0 || last || isTimeOrPlaceJump(text));
      if (allowed && !isStageDirection(text, 'Narrator', names)) { state.narratorLines++; kept.push({ ...l, text }); }
      else shown.push(text); // background narration becomes something the viewer sees
      continue;
    }
    if (isStageDirection(text, l.speaker, names)) { shown.push(text); continue; }
    kept.push({ ...l, text });
  }
  return { lines: kept, shown };
}

/** Wraps things that must be shown (not said) as an instruction for the video model. */
export function shownInstruction(shown: string[]): string {
  const s = shown.map((x) => x.replace(/[.\s]+$/, '')).filter(Boolean).join('. ');
  return s ? `Shown on screen through acting only, never said aloud: ${s}.` : '';
}

// ---------------------------------------------------------------- plain prose scripts (the no-AI fallback)

export type ProseUnit = { kind: 'speech' | 'action' | 'thought' | 'narration'; speaker: string; text: string };

const SPEECH_VERBS = 'said|says|asked|asks|replied|replies|shouted|shouts|whispered|whispers|cried|cries|yelled|yells|murmured|muttered|screamed|screams|answered|answers|called|calls|snapped|snaps|laughed|sighed|added|begged|demanded|growled|hissed|gasped|stammered|warned|declared|told|exclaimed|insisted|sobbed|roared';
const THOUGHT_WORDS = /\b(thought|wondered|remembered|realised|realized|felt|knew|wished|hoped|feared|dreamed|imagined|worried|decided|regretted|longed|suspected|believed)\b/i;
const NAME = /\b([A-Z][a-z]{1,15})\b/;
const NOT_NAMES = new Set(['The', 'A', 'An', 'He', 'She', 'They', 'It', 'His', 'Her', 'Their', 'Its', 'That', 'This', 'Then', 'When', 'As', 'And', 'But', 'Suddenly', 'Meanwhile', 'Later', 'Now', 'After', 'Before', 'At', 'In', 'On', 'With', 'From', 'There', 'Here', 'One', 'Two', 'Three', 'Once', 'Every', 'Each', 'All', 'Some', 'No', 'Not', 'What', 'Why', 'How', 'Who', 'Where', 'I', 'You', 'We', 'My', 'Your', 'Our', 'If', 'So', 'Yet', 'Still', 'Soon', 'Today', 'Tonight', 'Morning', 'Night', 'Day']);

/**
 * Reads plain prose the way a screenwriter would. Quoted speech becomes dialogue for the person who said it.
 * Sentences about thoughts become something to show. Everything else that happens is an action.
 * Nothing is read aloud by a narrator, except a short time or place jump such as "Three years later."
 */
export function proseToUnits(script: string): ProseUnit[] {
  const out: ProseUnit[] = [];
  let lastName = '';
  const paragraphs = script.split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const sentences = para.match(/(?:[^.!?…"“]|"[^"]*"|“[^”]*”)+[.!?…]*["”]?/g) || [para];
    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;
      const quotes = [...sentence.matchAll(/[“"]([^”"]{1,400})[”"]/g)];
      const rest = sentence.replace(/[“"][^”"]{1,400}[”"]/g, ' ').replace(/\s+/g, ' ').trim();
      // who is named in this sentence (not counting the first word when it is just the start of the sentence)
      const mentioned = [...rest.matchAll(new RegExp(NAME.source, 'g'))].map((m) => m[1]).filter((n) => !NOT_NAMES.has(n));
      if (mentioned.length) lastName = mentioned[0];

      if (quotes.length) {
        let speaker = '';
        const after = rest.match(new RegExp(`\\b([A-Z][a-z]{1,15})\\s+(?:${SPEECH_VERBS})\\b`));
        const before = rest.match(new RegExp(`\\b(?:${SPEECH_VERBS})\\s+([A-Z][a-z]{1,15})\\b`));
        if (after && !NOT_NAMES.has(after[1])) speaker = after[1];
        else if (before && !NOT_NAMES.has(before[1])) speaker = before[1];
        else speaker = lastName || 'Stranger';
        for (const q of quotes) out.push({ kind: 'speech', speaker, text: q[1].trim() });
        // what is left of the sentence is acting ("Mara said, gripping the rail" -> gripping the rail)
        const acting = rest.replace(new RegExp(`\\b(?:[A-Z][a-z]{1,15}\\s+)?(?:${SPEECH_VERBS})\\b(?:\\s+[A-Z][a-z]{1,15})?`, 'g'), ' ').replace(/^[\s,.;:—-]+|[\s,;:—-]+$/g, '').replace(/\s+/g, ' ').trim();
        if (wordsOf(acting).length >= 2) out.push({ kind: 'action', speaker: speaker, text: acting });
        continue;
      }
      if (!rest) continue;
      if (isTimeOrPlaceJump(rest)) { out.push({ kind: 'narration', speaker: 'Narrator', text: rest }); continue; }
      out.push({ kind: THOUGHT_WORDS.test(rest) ? 'thought' : 'action', speaker: lastName, text: rest });
    }
  }
  return out;
}

/** What to show for a thought: the feeling is performed and illustrated, never spoken. */
export function thoughtToVisual(text: string): string {
  return `Show this thought through the actor's face, body and a short visual insert (a reflection, an object, a memory flash), never spoken: ${text.replace(/[.\s]+$/, '')}.`;
}

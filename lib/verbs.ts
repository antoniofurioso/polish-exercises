import { capitalise, makeRng, pick, shuffle } from "./generate";
import { normalise, stripDiacritics } from "./grade";
import { LEXICON } from "./lexicon";
import { TENSES, withinLevel } from "./types";
import type {
  AnswerMode,
  Config,
  Exercise,
  Freq,
  GramNumber,
  Level,
  Review,
  Tense,
  VerbType,
} from "./types";

/**
 * The verbs exercise, five tenses / moods under one roof:
 *
 *   present         czas teraźniejszy — the imperfective non-past: piszę
 *   past            czas przeszły — pisałem, napisała, zjedliśmy
 *   future          czas przyszły prosty — the perfective non-past: napiszę
 *   futureCompound  czas przyszły złożony — będę pisać / będę pisał
 *   imperative      tryb rozkazujący — napisz! nie pisz! napiszmy!
 *
 * Polish conjugation is too irregular to derive from the infinitive, so each
 * verb stores a handful of principal parts and the rest is built from them.
 * Reflexive verbs carry "się", which the answers accept on either side of the
 * verb wherever Polish allows it.
 *
 * Not every verb is drilled in every tense. An imperfective-only verb
 * (chodzić, mieszkać, wiedzieć) has no simple future and no perfective frame;
 * a stative one (wiedzieć, lubić) no "all evening" or "every day"; a verb
 * that fits no frame of a tense is simply not drawn for it.
 */

type PastStems = {
  /** 3sg masculine: pisał, szedł, mógł. */
  m: string;
  /** Stem before -em / -eś when it differs from `m`: mógł → mogłem. */
  m1?: string;
  /** 3sg feminine: pisała, szła, mogła. */
  f: string;
  /** 3pl masculine-personal: pisali, szli, mogli. */
  vir: string;
};

type AspectForms = {
  inf: string;
  past: PastStems;
  /**
   * Non-past 1sg, 2sg, 3pl — enough to rebuild the rest: robię, robisz, robią.
   * For an imperfective verb that is the present, for a perfective the future.
   */
  pres: [string, string, string];
  /** 2sg imperative; the 1pl / 2pl add -my / -cie. Omitted when not in use. */
  imp?: string;
};

type Complement = {
  pl: string;
  /** Form after a negated verb when it differs: list → nie pisz listu. */
  neg?: string;
  en: string;
};

/**
 * English base, simple past and -ing form. A "be + adjective" base (be late,
 * be afraid of) has neither: "be" is conjugated (am late, was late).
 */
export type EnglishGloss = { base: string; past?: string; ing?: string };

export type Verb = {
  en: EnglishGloss;
  /** CEFR level of the aspect pair. */
  level: Level;
  /** 1 = most common; see data/README.md. */
  freq?: Freq;
  impf: AspectForms;
  /** Left out for an imperfective-only verb: chodzić, mieszkać, wiedzieć. */
  pf?: AspectForms;
  objects: Complement[];
  /** Takes "się": uczyć się, myć się. */
  reflexive?: true;
  /**
   * Determinate motion (iść, jechać): one trip in one direction, so no habit
   * ("codziennie idę" wants chodzić) and no stretch of time.
   */
  motion?: true;
  /**
   * Indeterminate motion (chodzić, jeździć): trips made again and again, so
   * only habits ("codziennie chodzę do pracy"), never one trip now.
   */
  indeterminate?: true;
  /** Over in a moment (wracać, budzić się): no "all evening" frames. */
  momentary?: true;
  /**
   * A state, not an action (wiedzieć, lubić, widzieć): English keeps the
   * simple present ("I understand now", never "I am understanding"), and
   * there are no "all evening" or "every day" frames.
   */
  stative?: true;
  /**
   * Only orders of this polarity sound right: "negated" for "Nie martw się!"
   * (never "Martw się!"), "affirmative" for "Pamiętaj o kluczach!".
   */
  orders?: "affirmative" | "negated";
  review?: Review;
};

/** The verb lexicon, in data/verbs.json; see data/README.md for the layout. */
export const VERBS: Verb[] = LEXICON.verbs;

// ---------------------------------------------------------------- subjects

export type Person = 1 | 2 | 3;
/** Who the verb agrees with: the past and the będę + -ł future mark gender. */
export type SubjectGender = "m" | "f" | "vir" | "nonvir";

export type Subject = {
  pl: string;
  person: Person;
  number: GramNumber;
  gender: SubjectGender;
  en: string;
  /** Short label for the hint; shows gender where the ending depends on it. */
  label: string;
};

export const SUBJECTS: Subject[] = [
  { pl: "ja", person: 1, number: "sg", gender: "m", en: "I", label: "ja ♂" },
  { pl: "ja", person: 1, number: "sg", gender: "f", en: "I", label: "ja ♀" },
  { pl: "ty", person: 2, number: "sg", gender: "m", en: "you", label: "ty ♂" },
  { pl: "ty", person: 2, number: "sg", gender: "f", en: "you", label: "ty ♀" },
  { pl: "on", person: 3, number: "sg", gender: "m", en: "he", label: "on" },
  { pl: "ona", person: 3, number: "sg", gender: "f", en: "she", label: "ona" },
  { pl: "my", person: 1, number: "pl", gender: "vir", en: "we", label: "my ♂" },
  {
    pl: "my",
    person: 1,
    number: "pl",
    gender: "nonvir",
    en: "we",
    label: "my ♀",
  },
  {
    pl: "wy",
    person: 2,
    number: "pl",
    gender: "vir",
    en: "you all",
    label: "wy ♂",
  },
  {
    pl: "wy",
    person: 2,
    number: "pl",
    gender: "nonvir",
    en: "you all",
    label: "wy ♀",
  },
  {
    pl: "oni",
    person: 3,
    number: "pl",
    gender: "vir",
    en: "they",
    label: "oni",
  },
  {
    pl: "one",
    person: 3,
    number: "pl",
    gender: "nonvir",
    en: "they",
    label: "one",
  },
];

// ------------------------------------------------------------- conjugation

/** The -ł form agreeing with a third-person subject: pisał / pisała / pisali / pisały. */
export function lForm(past: PastStems, gender: SubjectGender): string {
  switch (gender) {
    case "m":
      return past.m;
    case "f":
      return past.f;
    case "vir":
      return past.vir;
    case "nonvir":
      return past.f.slice(0, -1) + "y";
  }
}

/** Past tense: the -ł form plus the personal ending (-em, -aś, -liśmy...). */
export function pastForm(
  forms: AspectForms,
  person: Person,
  gender: SubjectGender,
): string {
  const { past } = forms;
  if (gender === "m") {
    const stem = past.m1 ?? past.m;
    return person === 1 ? `${stem}em` : person === 2 ? `${stem}eś` : past.m;
  }
  const base = lForm(past, gender);
  const plural = gender === "vir" || gender === "nonvir";
  if (person === 3) return base;
  if (plural) return base + (person === 1 ? "śmy" : "ście");
  return base + (person === 1 ? "m" : "ś");
}

/**
 * The non-past: present for an imperfective verb, future for a perfective.
 * The 3sg is the 2sg without its -sz; 1pl and 2pl hang off the 3sg.
 */
export function nonPast(
  forms: AspectForms,
  person: Person,
  number: GramNumber,
): string {
  const [first, second, thirdPl] = forms.pres;
  const third = second.slice(0, -2);
  if (number === "sg")
    return person === 1 ? first : person === 2 ? second : third;
  return person === 1 ? `${third}my` : person === 2 ? `${third}cie` : thirdPl;
}

/** Present tense — only imperfective verbs have one. */
export const presentForm = (verb: Verb, person: Person, number: GramNumber) =>
  nonPast(verb.impf, person, number);

/** Perfective non-past — which is to say, the simple future; null without a perfective. */
export const futureSimple = (
  verb: Verb,
  person: Person,
  number: GramNumber,
): string | null => (verb.pf ? nonPast(verb.pf, person, number) : null);

const BYC: Record<GramNumber, [string, string, string]> = {
  sg: ["będę", "będziesz", "będzie"],
  pl: ["będziemy", "będziecie", "będą"],
};

/** Compound future: będę + infinitive, or będę + the -ł form. Both are standard. */
export function futureCompound(
  impf: AspectForms,
  person: Person,
  number: GramNumber,
  gender: SubjectGender,
): string[] {
  const aux = BYC[number][person - 1];
  const inf = impf.inf.replace(/ się$/, "");
  return [`${aux} ${inf}`, `${aux} ${lForm(impf.past, gender)}`];
}

/** Imperative for ty / my / wy, or null when the verb has none in use. */
export function imperative(
  forms: AspectForms | undefined,
  person: Person,
  number: GramNumber,
): string | null {
  if (!forms?.imp) return null;
  if (number === "sg") return person === 2 ? forms.imp : null;
  if (person === 1) return `${forms.imp}my`;
  if (person === 2) return `${forms.imp}cie`;
  return null;
}

/**
 * Adds "się" to a reflexive form. The canonical spot is straight after the
 * verb (uczę się); after another word it may also come first (się uczę), and
 * in the compound future it usually sits after "będę" (będę się uczyć).
 */
export function withSie(
  verb: Verb,
  form: string,
  opts: { initial?: boolean } = {},
): string[] {
  if (!verb.reflexive) return [form];
  const words = form.split(" ");
  if (words.length === 2) {
    const [aux, main] = words;
    return [`${aux} się ${main}`, `${aux} ${main} się`];
  }
  return opts.initial ? [`${form} się`] : [`${form} się`, `się ${form}`];
}

/** The form as it would be shown in an option. */
const shown = (verb: Verb, form: string | null) =>
  form ? withSie(verb, form)[0] : null;

// ------------------------------------------------------------------ frames

type Aspect = "impf" | "pf";

type TimeFrame = {
  pl: string;
  /** English with {s} subject, {v} verb phrase, {o} complement. */
  en: string;
  aspect: Aspect;
  /** Which English verb shape {v} takes. */
  enVerb: "pres" | "presCont" | "past" | "pastCont" | "will" | "willBe";
  /** Describes an ongoing stretch of time. */
  durative?: true;
  /** Describes a repeated action. */
  habit?: true;
  /** Only for verbs with one of these flags; every other verb skips the frame. */
  only?: ("stative" | "indeterminate")[];
  note?: string;
};

const PRESENT_FRAMES: TimeFrame[] = [
  {
    pl: "Teraz",
    en: "{s} {v} {o} now.",
    aspect: "impf",
    enVerb: "presCont",
    note: 'Polish has one present for both "I do" and "I am doing".',
  },
  {
    pl: "Codziennie",
    en: "Every day {s} {v} {o}.",
    aspect: "impf",
    enVerb: "pres",
    habit: true,
    note: "A habit — the present of an imperfective verb.",
  },
  {
    pl: "Zwykle",
    en: "{s} usually {v} {o}.",
    aspect: "impf",
    enVerb: "pres",
    habit: true,
    note: "A habit — the present of an imperfective verb.",
  },
  {
    pl: "Chyba",
    en: "I think {s} {v} {o}.",
    aspect: "impf",
    enVerb: "pres",
    only: ["stative"],
    note: "A state, not an action — the present of an imperfective verb.",
  },
];

const PAST_FRAMES: TimeFrame[] = [
  {
    pl: "Wczoraj",
    en: "Yesterday {s} {v} {o}.",
    aspect: "pf",
    enVerb: "past",
    note: "A one-off action that got done — perfective past.",
  },
  {
    pl: "W sobotę",
    en: "On Saturday {s} {v} {o}.",
    aspect: "pf",
    enVerb: "past",
    note: "A single, finished event — perfective past.",
  },
  {
    pl: "Cały wieczór",
    en: "All evening {s} {v} {o}.",
    aspect: "impf",
    enVerb: "pastCont",
    durative: true,
    note: "Duration, not result — imperfective past.",
  },
  {
    pl: "Codziennie",
    en: "Every day {s} {v} {o}.",
    aspect: "impf",
    enVerb: "past",
    habit: true,
    note: "A habit, repeated — imperfective past.",
  },
  {
    pl: "Wtedy",
    en: "At that time {s} {v} {o}.",
    aspect: "impf",
    enVerb: "past",
    only: ["stative", "indeterminate"],
    note: "A state or habit at the time, not a one-off event — imperfective past.",
  },
];

const FUTURE_FRAMES: TimeFrame[] = [
  { pl: "Jutro", en: "Tomorrow {s} {v} {o}.", aspect: "pf", enVerb: "will" },
  { pl: "Dziś", en: "Today {s} {v} {o}.", aspect: "pf", enVerb: "will" },
  {
    pl: "W piątek",
    en: "On Friday {s} {v} {o}.",
    aspect: "pf",
    enVerb: "will",
  },
];

const COMPOUND_FRAMES: TimeFrame[] = [
  {
    pl: "Jutro cały dzień",
    en: "All day tomorrow {s} {v} {o}.",
    aspect: "impf",
    enVerb: "willBe",
    durative: true,
  },
  {
    pl: "Wieczorem",
    en: "This evening {s} {v} {o}.",
    aspect: "impf",
    enVerb: "willBe",
    durative: true,
  },
  {
    pl: "Od jutra codziennie",
    en: "From tomorrow {s} {v} {o} every day.",
    aspect: "impf",
    enVerb: "will",
    habit: true,
  },
];

/**
 * Whether a frame suits a verb: a perfective frame needs a perfective; a
 * frame marked `only` is for stative / indeterminate verbs alone; stative
 * verbs take no duration or habit, indeterminate ones nothing but habits;
 * determinate motion has no habit, quick actions no duration.
 */
function fits(frame: TimeFrame, verb: Verb): boolean {
  if (frame.aspect === "pf" && !verb.pf) return false;
  if (frame.only) return frame.only.some((flag) => verb[flag]);
  if (verb.stative && (frame.durative || frame.habit)) return false;
  if (verb.indeterminate && !frame.habit) return false;
  return (
    !(frame.durative && (verb.motion || verb.momentary)) &&
    !(frame.habit && verb.motion)
  );
}

/** The frames a verb fits, in their order. */
function framesFor(frames: TimeFrame[], verb: Verb): TimeFrame[] {
  return frames.filter((f) => fits(f, verb));
}

// ----------------------------------------------------------------- English

/** Who the English verb agrees with: "I", "she", "you all"... */
export type EnglishSubject = Pick<Subject, "en" | "person" | "number">;

const third = (s: EnglishSubject) => s.person === 3 && s.number === "sg";

/** "be late" → "late"; null when the base is not "be + something". */
const afterBe = (base: string): string | null =>
  /^be /.test(base) ? base.slice(3) : null;

/** Present of "be": I am, she is, we are. */
export const bePresent = (s: EnglishSubject) =>
  s.en === "I" ? "am" : third(s) ? "is" : "are";

/** Past of "be": I was, she was, we were. */
export const bePast = (s: EnglishSubject) =>
  s.en === "I" || third(s) ? "was" : "were";

/** 3sg of one English verb: studies, watches, goes, does, has, plays. */
function thirdSingular(verb: string): string {
  if (verb === "be") return "is";
  if (verb === "have") return "has";
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  if (/(ch|sh|s|x|z|o)$/.test(verb)) return `${verb}es`;
  return `${verb}s`;
}

/** English 3sg of a base: watch → watches, come back → comes back, be late → is late. */
export function englishS(base: string): string {
  const [head, ...rest] = base.split(" ");
  return [thirdSingular(head), ...rest].join(" ");
}

/** Simple present: I study, she studies, he is late. */
export function englishPresent(en: EnglishGloss, s: EnglishSubject): string {
  const rest = afterBe(en.base);
  if (rest !== null) return `${bePresent(s)} ${rest}`;
  return third(s) ? englishS(en.base) : en.base;
}

/** Simple past: I wrote, she was late, they were afraid of dogs. */
export function englishPast(en: EnglishGloss, s: EnglishSubject): string {
  const rest = afterBe(en.base);
  if (rest !== null) return `${bePast(s)} ${rest}`;
  return en.past ?? en.base;
}

/**
 * Present continuous: I am writing. A stative verb or a "be" base keeps the
 * simple present, which is what English says: I understand, I am late.
 */
export function englishPresentCont(
  en: EnglishGloss,
  s: EnglishSubject,
  stative = false,
): string {
  if (stative || !en.ing) return englishPresent(en, s);
  return `${bePresent(s)} ${en.ing}`;
}

/** Past continuous: I was writing; for a state the simple past (I knew, I was late). */
export function englishPastCont(
  en: EnglishGloss,
  s: EnglishSubject,
  stative = false,
): string {
  if (stative || !en.ing) return englishPast(en, s);
  return `${bePast(s)} ${en.ing}`;
}

/** Future: will write, will be late. */
export const englishWill = (en: EnglishGloss) => `will ${en.base}`;

/** Future continuous: will be writing; for a state plain "will" (will know, will be late). */
export function englishWillBe(en: EnglishGloss, stative = false): string {
  if (stative || !en.ing) return englishWill(en);
  return `will be ${en.ing}`;
}

/**
 * An order in English: "Write a letter!", "Don't be late for work, all of
 * you!", "Let's not worry about money!". The 1pl is "let's".
 */
export function englishOrder(
  base: string,
  person: Person,
  number: GramNumber,
  negated: boolean,
  object: string,
): string {
  if (person === 1) {
    return negated
      ? `Let's not ${base} ${object}!`
      : `Let's ${base} ${object}!`;
  }
  const all = number === "pl" ? ", all of you" : "";
  return `${negated ? `Don't ${base}` : capitalise(base)} ${object}${all}!`;
}

function englishVerb(verb: Verb, frame: TimeFrame, subject: Subject): string {
  const stative = !!verb.stative;
  switch (frame.enVerb) {
    case "pres":
      return englishPresent(verb.en, subject);
    case "presCont":
      return englishPresentCont(verb.en, subject, stative);
    case "past":
      return englishPast(verb.en, subject);
    case "pastCont":
      return englishPastCont(verb.en, subject, stative);
    case "will":
      return englishWill(verb.en);
    case "willBe":
      return englishWillBe(verb.en, stative);
  }
}

function englishSentence(
  verb: Verb,
  frame: TimeFrame,
  subject: Subject,
  obj: Complement,
): string {
  return capitalise(
    englishClause(
      frame.en,
      subject.en,
      englishVerb(verb, frame, subject),
      obj.en,
    ),
  );
}

/**
 * Fills a frame's {s} {v} {o}. A frequency adverb goes after a form of "be"
 * but before any other verb: "he usually works", "he is usually late".
 */
export function englishClause(
  frame: string,
  subject: string,
  verb: string,
  object: string,
): string {
  let text = frame;
  let v = verb;
  const be = /^(am|is|are|was|were) (.*)$/.exec(verb);
  const adverb = / (usually|often|always|never) \{v\}/.exec(text);
  if (be && adverb) {
    text = text.replace(adverb[0], " {v}");
    v = `${be[1]} ${adverb[1]} ${be[2]}`;
  }
  return text
    .replace("{s}", subject)
    .replace("{v}", v)
    .replace("{o}", object);
}

export const TENSE_LABEL: Record<Tense, string> = {
  present: "Czas teraźniejszy",
  past: "Czas przeszły",
  future: "Czas przyszły prosty",
  futureCompound: "Czas przyszły złożony",
  imperative: "Tryb rozkazujący",
};

const PERSON_WORD = ["", "first", "second", "third"];

const personWord = (s: Subject) =>
  `${PERSON_WORD[s.person]} person ${s.number === "sg" ? "singular" : "plural"}`;

function genderWord(s: Subject): string {
  if (s.number === "sg") return s.gender === "f" ? "feminine" : "masculine";
  return s.gender === "vir" ? "masculine-personal" : "non-masculine-personal";
}

const sieNote = (verb: Verb) =>
  verb.reflexive ? ` Don't drop "się" — the verb is reflexive.` : "";

// --------------------------------------------------------------- distractors

/** Right answer plus up to three other cells of the same verb, shuffled. */
function withDistractors(
  answers: string[],
  candidates: (string | null)[],
  rng: () => number,
  count = 4,
): string[] {
  const taken = new Set(answers.map((a) => stripDiacritics(normalise(a))));
  const out: string[] = [];
  for (const text of shuffle(
    candidates.filter((c): c is string => !!c),
    rng,
  )) {
    const key = stripDiacritics(normalise(text));
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(text);
    if (out.length === count - 1) break;
  }
  if (out.length === 0) return [];
  return shuffle([answers[0], ...out], rng);
}

// ---------------------------------------------------------------- builders

type Built = { exercise: Exercise; candidates: (string | null)[] };

function exerciseBase(
  id: string,
  tense: Tense,
  subject: Subject,
  before: string,
  after: string,
  answers: string[],
  hint: string,
  en: string,
  note: string,
): Exercise {
  return {
    id,
    case: "nom",
    number: subject.number,
    label: TENSE_LABEL[tense],
    before,
    after,
    tokens: [{ text: answers[0], blank: true }],
    hint,
    en,
    answers,
    note,
  };
}

function buildPresent(
  verb: Verb,
  subject: Subject,
  obj: Complement,
  rng: () => number,
): Built | null {
  const frames = framesFor(PRESENT_FRAMES, verb);
  if (frames.length === 0) return null;
  const frame = pick(frames, rng);
  const form = presentForm(verb, subject.person, subject.number);
  const note = `${frame.note} ${verb.impf.inf} → ${withSie(verb, form)[0]}: ${personWord(subject)}.${sieNote(verb)}`;

  return {
    exercise: exerciseBase(
      `present|${verb.impf.inf}|${subject.pl}|${obj.pl}|${frame.pl}`,
      "present",
      subject,
      `${frame.pl} `,
      ` ${obj.pl}.`,
      withSie(verb, form),
      `${verb.impf.inf} · ${subject.pl}`,
      englishSentence(verb, frame, subject, obj),
      note,
    ),
    candidates: [
      ...SUBJECTS.map((s) =>
        shown(verb, presentForm(verb, s.person, s.number)),
      ),
      shown(verb, futureSimple(verb, subject.person, subject.number)),
      shown(verb, pastForm(verb.impf, subject.person, subject.gender)),
      verb.reflexive ? form : null,
    ],
  };
}

function buildPast(
  verb: Verb,
  subject: Subject,
  obj: Complement,
  rng: () => number,
): Built | null {
  const frames = framesFor(PAST_FRAMES, verb);
  if (frames.length === 0) return null;
  const frame = pick(frames, rng);
  // fits() only lets a perfective frame through when there is a perfective
  const forms = frame.aspect === "pf" ? verb.pf! : verb.impf;
  const form = pastForm(forms, subject.person, subject.gender);
  const other = frame.aspect === "pf" ? verb.impf : verb.pf;
  const answers = withSie(verb, form);
  const note = `${frame.note} ${forms.inf} → ${answers[0]}: ${genderWord(subject)}, ${personWord(subject)}.${sieNote(verb)}`;

  return {
    exercise: exerciseBase(
      `past|${forms.inf}|${subject.label}|${obj.pl}|${frame.pl}`,
      "past",
      subject,
      `${frame.pl} `,
      ` ${obj.pl}.`,
      answers,
      `${forms.inf} · ${subject.label}`,
      englishSentence(verb, frame, subject, obj),
      note,
    ),
    candidates: [
      ...SUBJECTS.map((s) => shown(verb, pastForm(forms, s.person, s.gender))),
      shown(verb, other ? pastForm(other, subject.person, subject.gender) : null),
      verb.reflexive ? form : null,
    ],
  };
}

function buildFuture(
  verb: Verb,
  subject: Subject,
  obj: Complement,
  rng: () => number,
): Built | null {
  // the simple future is the perfective's: an imperfective-only verb has none
  const pf = verb.pf;
  if (!pf) return null;
  const frames = framesFor(FUTURE_FRAMES, verb);
  if (frames.length === 0) return null;
  const frame = pick(frames, rng);
  const form = nonPast(pf, subject.person, subject.number);
  const answers = withSie(verb, form);
  const note = `A perfective verb has no present: its "present" endings make the future — ${pf.inf} → ${answers[0]}. The action will be completed.${sieNote(verb)}`;

  return {
    exercise: exerciseBase(
      `future|${pf.inf}|${subject.pl}|${obj.pl}|${frame.pl}`,
      "future",
      subject,
      `${frame.pl} `,
      ` ${obj.pl}.`,
      answers,
      `${pf.inf} · ${subject.pl}`,
      englishSentence(verb, frame, subject, obj),
      note,
    ),
    candidates: [
      ...SUBJECTS.map((s) =>
        shown(verb, futureSimple(verb, s.person, s.number)),
      ),
      shown(
        verb,
        futureCompound(
          verb.impf,
          subject.person,
          subject.number,
          subject.gender,
        )[0],
      ),
      shown(verb, presentForm(verb, subject.person, subject.number)),
      shown(verb, pastForm(pf, subject.person, subject.gender)),
      verb.reflexive ? form : null,
    ],
  };
}

const OTHER_GENDER: Record<SubjectGender, SubjectGender> = {
  m: "f",
  f: "m",
  vir: "nonvir",
  nonvir: "vir",
};

function buildCompound(
  verb: Verb,
  subject: Subject,
  obj: Complement,
  rng: () => number,
): Built | null {
  const frames = framesFor(COMPOUND_FRAMES, verb);
  if (frames.length === 0) return null;
  const frame = pick(frames, rng);
  const [withInf, withL] = futureCompound(
    verb.impf,
    subject.person,
    subject.number,
    subject.gender,
  );
  const answers = [...withSie(verb, withInf), ...withSie(verb, withL)];
  const aux = BYC[subject.number][subject.person - 1];
  const both = `"${withSie(verb, withInf)[0]}" and "${withSie(verb, withL)[0]}" are both correct`;
  const note = `Imperfective future: "być" in the future (${aux}) + the infinitive or the -ł form — ${both}.${
    verb.reflexive ? ` "Się" usually goes straight after "${aux}".` : ""
  }`;

  return {
    exercise: exerciseBase(
      `compound|${verb.impf.inf}|${subject.label}|${obj.pl}|${frame.pl}`,
      "futureCompound",
      subject,
      `${frame.pl} `,
      ` ${obj.pl}.`,
      answers,
      `${verb.impf.inf} · ${subject.label}`,
      englishSentence(verb, frame, subject, obj),
      note,
    ),
    candidates: [
      ...SUBJECTS.filter((s) => s.number === subject.number).map((s) =>
        shown(verb, futureCompound(verb.impf, s.person, s.number, s.gender)[0]),
      ),
      shown(
        verb,
        futureCompound(
          verb.impf,
          subject.person,
          subject.number,
          OTHER_GENDER[subject.gender],
        )[1],
      ),
      verb.pf ? shown(verb, `${aux} ${verb.pf.inf.replace(/ się$/, "")}`) : null,
      shown(verb, futureSimple(verb, subject.person, subject.number)),
      verb.reflexive ? withInf : null,
    ],
  };
}

/** Orders go to ty, my and wy; gender never shows in the imperative. */
const IMPERATIVE_SUBJECTS = SUBJECTS.filter(
  (s) =>
    (s.person === 2 || (s.person === 1 && s.number === "pl")) &&
    (s.gender === "m" || s.gender === "vir"),
);

function buildImperative(
  verb: Verb,
  subject: Subject,
  obj: Complement,
  rng: () => number,
): Built | null {
  // affirmative orders lean perfective ("zrób!"); a negated one is imperfective ("nie rób!")
  const negated = rng() < 0.4;
  // "Nie martw się!" but never "Martw się!"; "Pamiętaj o kluczach!" but never "Nie pamiętaj"
  if (verb.orders === (negated ? "affirmative" : "negated")) return null;
  const aspect: Aspect = negated || !verb.pf?.imp ? "impf" : "pf";
  const forms = aspect === "pf" ? verb.pf! : verb.impf;
  const form = imperative(forms, subject.person, subject.number);
  if (!form) return null;

  const object = negated ? (obj.neg ?? obj.pl) : obj.pl;
  const en = englishOrder(
    verb.en.base,
    subject.person,
    subject.number,
    negated,
    obj.en,
  );

  const who =
    subject.number === "sg" ? "ty" : subject.person === 1 ? "my" : "wy";
  // in an order "się" always follows the verb: ucz się!, nie ucz się!
  const answer = verb.reflexive ? `${form} się` : form;
  const shape =
    subject.number === "sg"
      ? `The ty-form is the bare imperative: ${form}.`
      : subject.person === 1
        ? `"Let's…" adds -my to the ty-form: ${forms.imp} → ${form}.`
        : `The wy-form adds -cie to the ty-form: ${forms.imp} → ${form}.`;
  const aspectNote = negated
    ? `A negated order takes the imperfective (${verb.impf.inf}).${obj.neg ? ` The object goes into the genitive after "nie": ${obj.neg}.` : ""}`
    : aspect === "pf"
      ? `A one-off order usually takes the perfective (${forms.inf}).`
      : verb.pf
        ? `This verb's perfective has no imperative in everyday use, so the order takes ${verb.impf.inf}.`
        : `${verb.impf.inf} has no perfective in this sense, so the order is imperfective.`;
  const sie = verb.reflexive
    ? ` "Się" comes right after the verb: ${answer}.`
    : "";

  const other = aspect === "pf" ? verb.impf : verb.pf;
  const exercise = exerciseBase(
    `imp|${forms.inf}|${who}|${obj.pl}|${negated ? "neg" : "pos"}`,
    "imperative",
    subject,
    negated ? "Nie " : "",
    ` ${object}!`,
    [answer],
    `${forms.inf} · ${who}`,
    en,
    `${shape} ${aspectNote}${sie}`,
  );
  // the order opens the sentence: capitalise what is shown, grading ignores case
  if (!negated) exercise.tokens = [{ text: capitalise(answer), blank: true }];
  return {
    exercise,
    candidates: [
      shown(verb, imperative(forms, 2, "sg")),
      shown(verb, imperative(forms, 1, "pl")),
      shown(verb, imperative(forms, 2, "pl")),
      shown(verb, imperative(other, subject.person, subject.number)),
      shown(verb, futureSimple(verb, subject.person, subject.number)),
      verb.reflexive ? form : null,
      verb.reflexive && !negated ? `się ${form}` : null,
    ],
  };
}

/** Whether a verb makes a sentence in the tense at all, for some subject and polarity. */
const CAN_BUILD: Record<Tense, (verb: Verb) => boolean> = {
  present: (v) => framesFor(PRESENT_FRAMES, v).length > 0,
  past: (v) => framesFor(PAST_FRAMES, v).length > 0,
  future: (v) => !!v.pf && framesFor(FUTURE_FRAMES, v).length > 0,
  futureCompound: (v) => framesFor(COMPOUND_FRAMES, v).length > 0,
  imperative: (v) =>
    (v.orders !== "affirmative" && !!v.impf.imp) ||
    (v.orders !== "negated" && !!(v.pf?.imp ?? v.impf.imp)),
};

const BUILDERS: Record<
  Tense,
  (
    verb: Verb,
    subject: Subject,
    obj: Complement,
    rng: () => number,
  ) => Built | null
> = {
  present: buildPresent,
  past: buildPast,
  future: buildFuture,
  futureCompound: buildCompound,
  imperative: buildImperative,
};

function buildOne(
  tense: Tense,
  verbs: Verb[],
  numbers: GramNumber[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  const pool = (tense === "imperative" ? IMPERATIVE_SUBJECTS : SUBJECTS).filter(
    (s) => numbers.includes(s.number),
  );
  if (pool.length === 0 || verbs.length === 0) return null;

  const draw = (from: Verb[]): Exercise | null => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const verb = pick(from, rng);
      const built = BUILDERS[tense](
        verb,
        pick(pool, rng),
        pick(verb.objects, rng),
        rng,
      );
      if (!built) continue;

      const { exercise, candidates } = built;
      if (taken.has(exercise.id) && attempt < 30) continue;
      taken.add(exercise.id);

      if (answerMode === "choice") {
        const options = withDistractors(exercise.answers, candidates, rng);
        if (options.length > 1) exercise.options = options;
      }
      return exercise;
    }
    return null;
  };
  // Draw from every verb first, which keeps the sessions a seed gave before;
  // should that fail (a pool that is mostly imperfective-only verbs, drilled
  // in the simple future), draw again from just the verbs that fit the tense.
  const exercise = draw(verbs);
  if (exercise) return exercise;
  const able = verbs.filter(CAN_BUILD[tense]);
  return able.length > 0 ? draw(able) : null;
}

/** The verb pool for a session: plain, reflexive or both, up to `maxLevel` when set. */
export function verbsFor(
  kind: VerbType | undefined,
  maxLevel?: Level,
  lexicon: Verb[] = VERBS,
): Verb[] {
  const verbs = maxLevel
    ? lexicon.filter((v) => withinLevel(v, maxLevel))
    : lexicon;
  if (kind === "plain") return verbs.filter((v) => !v.reflexive);
  if (kind === "reflexive") return verbs.filter((v) => v.reflexive);
  return verbs;
}

/**
 * Builds a full verbs session, spreading the selected tenses evenly. `lexicon`
 * replaces the verb list the session draws from (the tests pass their own).
 */
export function buildVerbSession(
  config: Config,
  seed = Date.now(),
  lexicon: Verb[] = VERBS,
): Exercise[] {
  const rng = makeRng(seed);
  const tenses = config.tenses?.length ? config.tenses : [...TENSES];
  const numbers = config.numbers.length
    ? config.numbers
    : (["sg", "pl"] as GramNumber[]);
  const answerMode: AnswerMode =
    config.answerMode === "choice" ? "choice" : "typing";
  const verbs = verbsFor(config.verbType, config.maxLevel, lexicon);

  const taken = new Set<string>();
  const exercises: Exercise[] = [];
  let pool: Tense[] = [];
  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(tenses, rng);
    const tense = pool.pop()!;
    const exercise = buildOne(tense, verbs, numbers, answerMode, rng, taken);
    if (exercise) exercises.push(exercise);
  }
  return exercises;
}

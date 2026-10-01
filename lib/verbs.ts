import { capitalise, makeRng, pick, shuffle } from "./generate";
import { normalise, stripDiacritics } from "./grade";
import { TENSES } from "./types";
import type { AnswerMode, Config, Exercise, GramNumber, Tense } from "./types";

/**
 * The verbs exercise, four tenses / moods under one roof:
 *
 *   past            czas przeszły — pisałem, napisała, zjedliśmy
 *   future          czas przyszły prosty — the perfective non-past: napiszę
 *   futureCompound  czas przyszły złożony — będę pisać / będę pisał
 *   imperative      tryb rozkazujący — napisz! nie pisz! napiszmy!
 *
 * Polish conjugation is too irregular to derive from the infinitive, so each
 * verb stores a handful of principal parts and the rest is built from them.
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
  /** 2sg imperative; the 1pl / 2pl add -my / -cie. Omitted when not in use. */
  imp?: string;
};

type PerfectiveForms = AspectForms & {
  /** Non-past 1sg, 2sg, 3pl — enough to rebuild the rest: zrobię, zrobisz, zrobią. */
  pres: [string, string, string];
};

type Complement = {
  pl: string;
  /** Form after a negated verb when it differs: list → nie pisz listu. */
  neg?: string;
  en: string;
};

export type Verb = {
  /** English base, simple past and -ing form. */
  en: { base: string; past: string; ing: string };
  impf: AspectForms;
  pf: PerfectiveForms;
  objects: Complement[];
  /** Going somewhere: "all evening I was going home" makes no sense, so no durative frames. */
  motion?: true;
};

export const VERBS: Verb[] = [
  {
    en: { base: "make", past: "made", ing: "making" },
    impf: { inf: "robić", past: { m: "robił", f: "robiła", vir: "robili" }, imp: "rób" },
    pf: {
      inf: "zrobić",
      past: { m: "zrobił", f: "zrobiła", vir: "zrobili" },
      pres: ["zrobię", "zrobisz", "zrobią"],
      imp: "zrób",
    },
    objects: [
      { pl: "obiad", neg: "obiadu", en: "dinner" },
      { pl: "kawę", neg: "kawy", en: "coffee" },
      { pl: "ciasto", neg: "ciasta", en: "a cake" },
    ],
  },
  {
    en: { base: "write", past: "wrote", ing: "writing" },
    impf: { inf: "pisać", past: { m: "pisał", f: "pisała", vir: "pisali" }, imp: "pisz" },
    pf: {
      inf: "napisać",
      past: { m: "napisał", f: "napisała", vir: "napisali" },
      pres: ["napiszę", "napiszesz", "napiszą"],
      imp: "napisz",
    },
    objects: [
      { pl: "list", neg: "listu", en: "a letter" },
      { pl: "e-mail", neg: "e-maila", en: "an email" },
      { pl: "raport", neg: "raportu", en: "the report" },
    ],
  },
  {
    en: { base: "read", past: "read", ing: "reading" },
    impf: { inf: "czytać", past: { m: "czytał", f: "czytała", vir: "czytali" }, imp: "czytaj" },
    pf: {
      inf: "przeczytać",
      past: { m: "przeczytał", f: "przeczytała", vir: "przeczytali" },
      pres: ["przeczytam", "przeczytasz", "przeczytają"],
      imp: "przeczytaj",
    },
    objects: [
      { pl: "książkę", neg: "książki", en: "a book" },
      { pl: "gazetę", neg: "gazety", en: "the newspaper" },
      { pl: "artykuł", neg: "artykułu", en: "the article" },
    ],
  },
  {
    en: { base: "drink", past: "drank", ing: "drinking" },
    impf: { inf: "pić", past: { m: "pił", f: "piła", vir: "pili" }, imp: "pij" },
    pf: {
      inf: "wypić",
      past: { m: "wypił", f: "wypiła", vir: "wypili" },
      pres: ["wypiję", "wypijesz", "wypiją"],
      imp: "wypij",
    },
    objects: [
      { pl: "kawę", neg: "kawy", en: "the coffee" },
      { pl: "herbatę", neg: "herbaty", en: "the tea" },
      { pl: "wodę", neg: "wody", en: "the water" },
    ],
  },
  {
    en: { base: "eat", past: "ate", ing: "eating" },
    impf: { inf: "jeść", past: { m: "jadł", f: "jadła", vir: "jedli" }, imp: "jedz" },
    pf: {
      inf: "zjeść",
      past: { m: "zjadł", f: "zjadła", vir: "zjedli" },
      pres: ["zjem", "zjesz", "zjedzą"],
      imp: "zjedz",
    },
    objects: [
      { pl: "śniadanie", neg: "śniadania", en: "breakfast" },
      { pl: "zupę", neg: "zupy", en: "the soup" },
      { pl: "jabłko", neg: "jabłka", en: "an apple" },
    ],
  },
  {
    en: { base: "buy", past: "bought", ing: "buying" },
    impf: {
      inf: "kupować",
      past: { m: "kupował", f: "kupowała", vir: "kupowali" },
      imp: "kupuj",
    },
    pf: {
      inf: "kupić",
      past: { m: "kupił", f: "kupiła", vir: "kupili" },
      pres: ["kupię", "kupisz", "kupią"],
      imp: "kup",
    },
    objects: [
      { pl: "chleb", neg: "chleba", en: "bread" },
      { pl: "bilety", neg: "biletów", en: "the tickets" },
      { pl: "prezent", neg: "prezentu", en: "a present" },
    ],
  },
  {
    en: { base: "watch", past: "watched", ing: "watching" },
    impf: {
      inf: "oglądać",
      past: { m: "oglądał", f: "oglądała", vir: "oglądali" },
      imp: "oglądaj",
    },
    pf: {
      inf: "obejrzeć",
      past: { m: "obejrzał", f: "obejrzała", vir: "obejrzeli" },
      pres: ["obejrzę", "obejrzysz", "obejrzą"],
      imp: "obejrzyj",
    },
    objects: [
      { pl: "film", neg: "filmu", en: "a film" },
      { pl: "mecz", neg: "meczu", en: "the match" },
      { pl: "serial", neg: "serialu", en: "the series" },
    ],
  },
  {
    en: { base: "take", past: "took", ing: "taking" },
    impf: { inf: "brać", past: { m: "brał", f: "brała", vir: "brali" }, imp: "bierz" },
    pf: {
      inf: "wziąć",
      past: { m: "wziął", f: "wzięła", vir: "wzięli" },
      pres: ["wezmę", "weźmiesz", "wezmą"],
      imp: "weź",
    },
    objects: [
      { pl: "parasol", neg: "parasola", en: "an umbrella" },
      { pl: "taksówkę", neg: "taksówki", en: "a taxi" },
      { pl: "klucze", neg: "kluczy", en: "the keys" },
    ],
  },
  {
    en: { base: "go", past: "went", ing: "going" },
    // "pójdź" is archaic — the affirmative imperative falls back to "idź"
    motion: true,
    impf: { inf: "iść", past: { m: "szedł", f: "szła", vir: "szli" }, imp: "idź" },
    pf: {
      inf: "pójść",
      past: { m: "poszedł", f: "poszła", vir: "poszli" },
      pres: ["pójdę", "pójdziesz", "pójdą"],
    },
    objects: [
      { pl: "do domu", en: "home" },
      { pl: "do pracy", en: "to work" },
      { pl: "na spacer", en: "for a walk" },
    ],
  },
  {
    en: { base: "go", past: "went", ing: "going" },
    motion: true,
    impf: { inf: "jechać", past: { m: "jechał", f: "jechała", vir: "jechali" }, imp: "jedź" },
    pf: {
      inf: "pojechać",
      past: { m: "pojechał", f: "pojechała", vir: "pojechali" },
      pres: ["pojadę", "pojedziesz", "pojadą"],
      imp: "pojedź",
    },
    objects: [
      { pl: "do Krakowa", en: "to Kraków" },
      { pl: "nad morze", en: "to the seaside" },
      { pl: "w góry", en: "to the mountains" },
    ],
  },
  {
    en: { base: "clean", past: "cleaned", ing: "cleaning" },
    impf: {
      inf: "sprzątać",
      past: { m: "sprzątał", f: "sprzątała", vir: "sprzątali" },
      imp: "sprzątaj",
    },
    pf: {
      inf: "posprzątać",
      past: { m: "posprzątał", f: "posprzątała", vir: "posprzątali" },
      pres: ["posprzątam", "posprzątasz", "posprzątają"],
      imp: "posprzątaj",
    },
    objects: [
      { pl: "mieszkanie", neg: "mieszkania", en: "the flat" },
      { pl: "kuchnię", neg: "kuchni", en: "the kitchen" },
      { pl: "pokój", neg: "pokoju", en: "the room" },
    ],
  },
  {
    en: { base: "cook", past: "cooked", ing: "cooking" },
    impf: {
      inf: "gotować",
      past: { m: "gotował", f: "gotowała", vir: "gotowali" },
      imp: "gotuj",
    },
    pf: {
      inf: "ugotować",
      past: { m: "ugotował", f: "ugotowała", vir: "ugotowali" },
      pres: ["ugotuję", "ugotujesz", "ugotują"],
      imp: "ugotuj",
    },
    objects: [
      { pl: "zupę", neg: "zupy", en: "soup" },
      { pl: "makaron", neg: "makaronu", en: "pasta" },
      { pl: "ryż", neg: "ryżu", en: "rice" },
    ],
  },
  {
    en: { base: "pay", past: "paid", ing: "paying" },
    impf: { inf: "płacić", past: { m: "płacił", f: "płaciła", vir: "płacili" }, imp: "płać" },
    pf: {
      inf: "zapłacić",
      past: { m: "zapłacił", f: "zapłaciła", vir: "zapłacili" },
      pres: ["zapłacę", "zapłacisz", "zapłacą"],
      imp: "zapłać",
    },
    objects: [
      { pl: "rachunek", neg: "rachunku", en: "the bill" },
      { pl: "za kawę", en: "for the coffee" },
      { pl: "czynsz", neg: "czynszu", en: "the rent" },
    ],
  },
  {
    en: { base: "call", past: "called", ing: "calling" },
    impf: {
      inf: "dzwonić",
      past: { m: "dzwonił", f: "dzwoniła", vir: "dzwonili" },
      imp: "dzwoń",
    },
    pf: {
      inf: "zadzwonić",
      past: { m: "zadzwonił", f: "zadzwoniła", vir: "zadzwonili" },
      pres: ["zadzwonię", "zadzwonisz", "zadzwonią"],
      imp: "zadzwoń",
    },
    objects: [
      { pl: "do mamy", en: "Mum" },
      { pl: "do szefa", en: "the boss" },
      { pl: "do lekarza", en: "the doctor" },
    ],
  },
  {
    en: { base: "open", past: "opened", ing: "opening" },
    impf: {
      inf: "otwierać",
      past: { m: "otwierał", f: "otwierała", vir: "otwierali" },
      imp: "otwieraj",
    },
    pf: {
      inf: "otworzyć",
      past: { m: "otworzył", f: "otworzyła", vir: "otworzyli" },
      pres: ["otworzę", "otworzysz", "otworzą"],
      imp: "otwórz",
    },
    objects: [
      { pl: "okno", neg: "okna", en: "the window" },
      { pl: "drzwi", en: "the door" },
      { pl: "butelkę", neg: "butelki", en: "the bottle" },
    ],
  },
  {
    en: { base: "close", past: "closed", ing: "closing" },
    impf: {
      inf: "zamykać",
      past: { m: "zamykał", f: "zamykała", vir: "zamykali" },
      imp: "zamykaj",
    },
    pf: {
      inf: "zamknąć",
      past: { m: "zamknął", f: "zamknęła", vir: "zamknęli" },
      pres: ["zamknę", "zamkniesz", "zamkną"],
      imp: "zamknij",
    },
    objects: [
      { pl: "okno", neg: "okna", en: "the window" },
      { pl: "drzwi", en: "the door" },
      { pl: "sklep", neg: "sklepu", en: "the shop" },
    ],
  },
  {
    en: { base: "help", past: "helped", ing: "helping" },
    impf: {
      inf: "pomagać",
      past: { m: "pomagał", f: "pomagała", vir: "pomagali" },
      imp: "pomagaj",
    },
    pf: {
      inf: "pomóc",
      past: { m: "pomógł", m1: "pomogł", f: "pomogła", vir: "pomogli" },
      pres: ["pomogę", "pomożesz", "pomogą"],
      imp: "pomóż",
    },
    objects: [
      { pl: "mamie", en: "Mum" },
      { pl: "bratu", en: "my brother" },
      { pl: "sąsiadce", en: "the neighbour" },
    ],
  },
  {
    en: { base: "come back", past: "came back", ing: "coming back" },
    motion: true,
    impf: {
      inf: "wracać",
      past: { m: "wracał", f: "wracała", vir: "wracali" },
      imp: "wracaj",
    },
    pf: {
      inf: "wrócić",
      past: { m: "wrócił", f: "wróciła", vir: "wrócili" },
      pres: ["wrócę", "wrócisz", "wrócą"],
      imp: "wróć",
    },
    objects: [
      { pl: "do domu", en: "home" },
      { pl: "z pracy", en: "from work" },
      { pl: "późno", en: "late" },
    ],
  },
  {
    en: { base: "finish", past: "finished", ing: "finishing" },
    impf: {
      inf: "kończyć",
      past: { m: "kończył", f: "kończyła", vir: "kończyli" },
      imp: "kończ",
    },
    pf: {
      inf: "skończyć",
      past: { m: "skończył", f: "skończyła", vir: "skończyli" },
      pres: ["skończę", "skończysz", "skończą"],
      imp: "skończ",
    },
    objects: [
      { pl: "projekt", neg: "projektu", en: "the project" },
      { pl: "książkę", neg: "książki", en: "the book" },
      { pl: "pracę", neg: "pracy", en: "work" },
    ],
  },
  {
    en: { base: "wash", past: "washed", ing: "washing" },
    impf: { inf: "myć", past: { m: "mył", f: "myła", vir: "myli" }, imp: "myj" },
    pf: {
      inf: "umyć",
      past: { m: "umył", f: "umyła", vir: "umyli" },
      pres: ["umyję", "umyjesz", "umyją"],
      imp: "umyj",
    },
    objects: [
      { pl: "naczynia", neg: "naczyń", en: "the dishes" },
      { pl: "samochód", neg: "samochodu", en: "the car" },
      { pl: "okna", neg: "okien", en: "the windows" },
    ],
  },
  {
    en: { base: "rest", past: "rested", ing: "resting" },
    impf: {
      inf: "odpoczywać",
      past: { m: "odpoczywał", f: "odpoczywała", vir: "odpoczywali" },
      imp: "odpoczywaj",
    },
    pf: {
      inf: "odpocząć",
      past: { m: "odpoczął", f: "odpoczęła", vir: "odpoczęli" },
      pres: ["odpocznę", "odpoczniesz", "odpoczną"],
      imp: "odpocznij",
    },
    objects: [
      { pl: "w domu", en: "at home" },
      { pl: "w ogrodzie", en: "in the garden" },
      { pl: "nad jeziorem", en: "by the lake" },
    ],
  },
  {
    en: { base: "give", past: "gave", ing: "giving" },
    impf: { inf: "dawać", past: { m: "dawał", f: "dawała", vir: "dawali" }, imp: "dawaj" },
    pf: {
      inf: "dać",
      past: { m: "dał", f: "dała", vir: "dali" },
      pres: ["dam", "dasz", "dadzą"],
      imp: "daj",
    },
    objects: [
      { pl: "mamie kwiaty", neg: "mamie kwiatów", en: "Mum flowers" },
      { pl: "psu wodę", neg: "psu wody", en: "the dog water" },
      { pl: "dziecku jabłko", neg: "dziecku jabłka", en: "the child an apple" },
    ],
  },
  {
    en: { base: "sing", past: "sang", ing: "singing" },
    impf: {
      inf: "śpiewać",
      past: { m: "śpiewał", f: "śpiewała", vir: "śpiewali" },
      imp: "śpiewaj",
    },
    pf: {
      inf: "zaśpiewać",
      past: { m: "zaśpiewał", f: "zaśpiewała", vir: "zaśpiewali" },
      pres: ["zaśpiewam", "zaśpiewasz", "zaśpiewają"],
      imp: "zaśpiewaj",
    },
    objects: [
      { pl: "piosenkę", neg: "piosenki", en: "a song" },
      { pl: "kolędę", neg: "kolędy", en: "a carol" },
      { pl: "hymn", neg: "hymnu", en: "the anthem" },
    ],
  },
];

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
  { pl: "my", person: 1, number: "pl", gender: "nonvir", en: "we", label: "my ♀" },
  { pl: "wy", person: 2, number: "pl", gender: "vir", en: "you all", label: "wy ♂" },
  { pl: "wy", person: 2, number: "pl", gender: "nonvir", en: "you all", label: "wy ♀" },
  { pl: "oni", person: 3, number: "pl", gender: "vir", en: "they", label: "oni" },
  { pl: "one", person: 3, number: "pl", gender: "nonvir", en: "they", label: "one" },
];

/** Label for tenses where gender makes no difference to the ending. */
const plainLabel = (s: Subject) => s.pl;

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
export function pastForm(forms: AspectForms, person: Person, gender: SubjectGender): string {
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

/** Perfective non-past — which is to say, the simple future. */
export function futureSimple(pf: PerfectiveForms, person: Person, number: GramNumber): string {
  const [first, second, thirdPl] = pf.pres;
  // the 3sg is the 2sg without its -sz; 1pl and 2pl hang off the 3sg
  const third = second.slice(0, -2);
  if (number === "sg") return person === 1 ? first : person === 2 ? second : third;
  return person === 1 ? `${third}my` : person === 2 ? `${third}cie` : thirdPl;
}

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
  return [`${aux} ${impf.inf}`, `${aux} ${lForm(impf.past, gender)}`];
}

/** Imperative for ty / my / wy, or null when the verb has none in use. */
export function imperative(forms: AspectForms, person: Person, number: GramNumber): string | null {
  if (!forms.imp) return null;
  if (number === "sg") return person === 2 ? forms.imp : null;
  if (person === 1) return `${forms.imp}my`;
  if (person === 2) return `${forms.imp}cie`;
  return null;
}

// ------------------------------------------------------------------ frames

type Aspect = "impf" | "pf";

type TimeFrame = {
  pl: string;
  /** English with {s} subject, {v} verb phrase, {o} complement. */
  en: string;
  aspect: Aspect;
  /** Which English verb shape {v} takes. */
  enVerb: "past" | "pastCont" | "will" | "willBe";
  /** Describes an ongoing stretch of time rather than a result or a habit. */
  durative?: true;
  note?: string;
};

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
    note: "A habit, repeated — imperfective past.",
  },
];

const FUTURE_FRAMES: TimeFrame[] = [
  {
    pl: "Jutro",
    en: "Tomorrow {s} {v} {o}.",
    aspect: "pf",
    enVerb: "will",
  },
  {
    pl: "Zaraz",
    en: "{s} {v} {o} right away.",
    aspect: "pf",
    enVerb: "will",
  },
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
  },
];

const BE_PAST: Record<string, string> = { I: "was", he: "was", she: "was" };

function englishVerb(verb: Verb, frame: TimeFrame, subject: Subject): string {
  switch (frame.enVerb) {
    case "past":
      return verb.en.past;
    case "pastCont":
      return `${BE_PAST[subject.en] ?? "were"} ${verb.en.ing}`;
    case "will":
      return `will ${verb.en.base}`;
    case "willBe":
      return `will be ${verb.en.ing}`;
  }
}

function englishSentence(verb: Verb, frame: TimeFrame, subject: Subject, obj: Complement): string {
  const text = frame.en
    .replace("{s}", subject.en)
    .replace("{v}", englishVerb(verb, frame, subject))
    .replace("{o}", obj.en);
  return capitalise(text);
}

export const TENSE_LABEL: Record<Tense, string> = {
  past: "Czas przeszły",
  future: "Czas przyszły prosty",
  futureCompound: "Czas przyszły złożony",
  imperative: "Tryb rozkazujący",
};

const PERSON_WORD = ["", "first", "second", "third"];

function genderWord(s: Subject): string {
  if (s.number === "sg") return s.gender === "f" ? "feminine" : "masculine";
  return s.gender === "vir" ? "masculine-personal" : "non-masculine-personal";
}

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
  for (const text of shuffle(candidates.filter((c): c is string => !!c), rng)) {
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

function buildPast(verb: Verb, subject: Subject, obj: Complement, rng: () => number): Built {
  const frame = pick(framesFor(PAST_FRAMES, verb), rng);
  const forms = verb[frame.aspect];
  const form = pastForm(forms, subject.person, subject.gender);
  const other = frame.aspect === "pf" ? verb.impf : verb.pf;

  const person = `${PERSON_WORD[subject.person]} person ${subject.number === "sg" ? "singular" : "plural"}`;
  const note = `${frame.note} ${forms.inf} → ${form}: ${genderWord(subject)}, ${person}.`;

  return {
    exercise: exerciseBase(
      `past|${forms.inf}|${subject.label}|${obj.pl}|${frame.pl}`,
      "past",
      subject,
      `${frame.pl} `,
      ` ${obj.pl}.`,
      [form],
      `${forms.inf} · ${subject.label}`,
      englishSentence(verb, frame, subject, obj),
      note,
    ),
    candidates: [
      ...SUBJECTS.map((s) => pastForm(forms, s.person, s.gender)),
      pastForm(other, subject.person, subject.gender),
    ],
  };
}

function buildFuture(verb: Verb, subject: Subject, obj: Complement, rng: () => number): Built {
  const frame = pick(FUTURE_FRAMES, rng);
  const form = futureSimple(verb.pf, subject.person, subject.number);
  const note = `A perfective verb has no present: its "present" endings make the future — ${verb.pf.inf} → ${form}. The action will be completed.`;

  return {
    exercise: exerciseBase(
      `future|${verb.pf.inf}|${subject.pl}|${obj.pl}|${frame.pl}`,
      "future",
      subject,
      `${frame.pl} `,
      ` ${obj.pl}.`,
      [form],
      `${verb.pf.inf} · ${plainLabel(subject)}`,
      englishSentence(verb, frame, subject, obj),
      note,
    ),
    candidates: [
      ...SUBJECTS.map((s) => futureSimple(verb.pf, s.person, s.number)),
      ...futureCompound(verb.impf, subject.person, subject.number, subject.gender),
      pastForm(verb.pf, subject.person, subject.gender),
    ],
  };
}

function buildCompound(verb: Verb, subject: Subject, obj: Complement, rng: () => number): Built {
  const frame = pick(framesFor(COMPOUND_FRAMES, verb), rng);
  const answers = futureCompound(verb.impf, subject.person, subject.number, subject.gender);
  const note = `Imperfective future: "być" in the future (${BYC[subject.number][subject.person - 1]}) + the infinitive or the -ł form — "${answers[0]}" and "${answers[1]}" are both correct.`;

  const wrongGender: SubjectGender =
    subject.gender === "m" ? "f" : subject.gender === "f" ? "m" : subject.gender === "vir" ? "nonvir" : "vir";
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
      ...SUBJECTS.filter((s) => s.number === subject.number).map(
        (s) => futureCompound(verb.impf, s.person, s.number, s.gender)[0],
      ),
      futureCompound(verb.impf, subject.person, subject.number, wrongGender)[1],
      `${BYC[subject.number][subject.person - 1]} ${verb.pf.inf}`,
      futureSimple(verb.pf, subject.person, subject.number),
    ],
  };
}

const IMPERATIVE_SUBJECTS = SUBJECTS.filter(
  (s) => (s.person === 2 || (s.person === 1 && s.number === "pl")) && s.gender !== "f" && s.gender !== "nonvir",
);

function buildImperative(
  verb: Verb,
  subject: Subject,
  obj: Complement,
  rng: () => number,
): Built | null {
  // affirmative orders lean perfective ("zrób!"); a negated one is imperfective ("nie rób!")
  const negated = rng() < 0.4;
  const aspect: Aspect = negated || !verb.pf.imp ? "impf" : "pf";
  const forms = verb[aspect];
  const form = imperative(forms, subject.person, subject.number);
  if (!form) return null;

  const object = negated ? (obj.neg ?? obj.pl) : obj.pl;
  const base = verb.en.base;
  const en =
    subject.person === 1
      ? negated
        ? `Let's not ${base} ${obj.en}!`
        : `Let's ${base} ${obj.en}!`
      : `${negated ? `Don't ${base}` : capitalise(base)} ${obj.en}${subject.number === "pl" ? ", all of you" : ""}!`;

  const who = subject.number === "sg" ? "ty" : subject.person === 1 ? "my" : "wy";
  const shape =
    subject.number === "sg"
      ? `The ty-form is the bare imperative: ${form}.`
      : subject.person === 1
        ? `"Let's…" adds -my to the ty-form: ${forms.imp} → ${form}.`
        : `The wy-form adds -cie to the ty-form: ${forms.imp} → ${form}.`;
  const aspectNote = negated
    ? `A negated order takes the imperfective (${verb.impf.inf}).${obj.neg ? ` The object goes into the genitive after "nie": ${obj.neg}.` : ""}`
    : aspect === "pf"
      ? `A one-off order usually takes the perfective (${verb.pf.inf}).`
      : `This verb's perfective has no imperative in everyday use, so the order takes ${verb.impf.inf}.`;

  const other = aspect === "pf" ? verb.impf : verb.pf;
  const exercise = exerciseBase(
    `imp|${forms.inf}|${who}|${obj.pl}|${negated ? "neg" : "pos"}`,
    "imperative",
    subject,
    negated ? "Nie " : "",
    ` ${object}!`,
    [form],
    `${forms.inf} · ${who}`,
    en,
    `${shape} ${aspectNote}`,
  );
  // the order opens the sentence: capitalise what is shown, grading ignores case
  if (!negated) exercise.tokens = [{ text: capitalise(form), blank: true }];
  return {
    exercise,
    candidates: [
      imperative(forms, 2, "sg"),
      imperative(forms, 1, "pl"),
      imperative(forms, 2, "pl"),
      imperative(other, subject.person, subject.number),
      futureSimple(verb.pf, subject.person, subject.number),
    ],
  };
}

function buildOne(
  tense: Tense,
  numbers: GramNumber[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const verb = pick(VERBS, rng);
    const obj = pick(verb.objects, rng);
    const pool = (tense === "imperative" ? IMPERATIVE_SUBJECTS : SUBJECTS).filter((s) =>
      numbers.includes(s.number),
    );
    if (pool.length === 0) return null;
    const subject = pick(pool, rng);

    const built =
      tense === "past"
        ? buildPast(verb, subject, obj, rng)
        : tense === "future"
          ? buildFuture(verb, subject, obj, rng)
          : tense === "futureCompound"
            ? buildCompound(verb, subject, obj, rng)
            : buildImperative(verb, subject, obj, rng);
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
}

/** The frames a verb fits: motion verbs skip the durative ones. */
const framesFor = (frames: TimeFrame[], verb: Verb) =>
  verb.motion ? frames.filter((f) => !f.durative) : frames;

/** Builds a full verbs session, spreading the selected tenses evenly. */
export function buildVerbSession(config: Config, seed = Date.now()): Exercise[] {
  const rng = makeRng(seed);
  const tenses = config.tenses?.length ? config.tenses : [...TENSES];
  const numbers = config.numbers.length ? config.numbers : (["sg", "pl"] as GramNumber[]);
  const answerMode: AnswerMode = config.answerMode === "choice" ? "choice" : "typing";

  const taken = new Set<string>();
  const exercises: Exercise[] = [];
  let pool: Tense[] = [];
  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(tenses, rng);
    const tense = pool.pop()!;
    const exercise = buildOne(tense, numbers, answerMode, rng, taken);
    if (exercise) exercises.push(exercise);
  }
  return exercises;
}

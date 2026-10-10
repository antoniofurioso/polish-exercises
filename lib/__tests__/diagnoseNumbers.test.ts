import { describe, expect, it } from "vitest";
import { diagnoseNumberMiss } from "../diagnoseNumbers";
import { DRILLS } from "../drills";
import { buildSession } from "../generate";
import { stripDiacritics } from "../grade";
import { NOUNS, nounVariants } from "../nouns";
import { buildNumberSession } from "../numbers";
import { declineNumeral, ordinal } from "../numerals";
import { CASES, GENDERS, NUMBER_DRILLS } from "../types";
import type { Config, Exercise, GramNumber } from "../types";

const cards = DRILLS.numbers.cards;

const session = (drills: Config["drills"], seed: number, count = 40): Exercise[] =>
  buildNumberSession(
    { kind: "numbers", drills, cases: [], numbers: ["sg", "pl"], mode: "nouns", count, max: 9999 },
    seed,
  );

/** Every exercise of a card for seeds 1..n. */
const builds = (card: string, n = 60): Exercise[] =>
  Array.from({ length: n }, (_, i) => cards.build(card, i + 1)).filter((e): e is Exercise => e !== null);

/** The first build of a card that passes `test`. */
function find(card: string, test: (ex: Exercise) => boolean): Exercise {
  for (let seed = 1; seed < 2000; seed++) {
    const ex = cards.build(card, seed);
    if (ex && test(ex)) return ex;
  }
  throw new Error(`no build of ${card} fits`);
}

const drawn = (ex: Exercise) => Number(ex.id.split("|")[1]);
const lemmaOf = (ex: Exercise) => ex.id.split("|")[2];
const nounOf = (ex: Exercise) => NOUNS.find((n) => n.lemma === lemmaOf(ex))!;
const loose = (s: string) => stripDiacritics(s.toLowerCase());
const NUMBERS: GramNumber[] = ["sg", "pl"];

/** A wide sample: configured sessions of every sub-drill and every card's builds. */
const SAMPLE: Exercise[] = [
  ...[1, 2, 3, 4, 5].flatMap((seed) => session([...NUMBER_DRILLS], seed)),
  ...cards.all().flatMap((c) => builds(c.id, 5)),
];

describe("diagnoseNumberMiss: every drill", () => {
  it("has real exercises of every sub-drill to work on", () => {
    for (const drill of NUMBER_DRILLS) {
      expect(SAMPLE.some((ex) => ex.card?.startsWith(`numbers:${drill}|`))).toBe(true);
    }
  });

  it("says nothing about a right answer, with or without its diacritics", () => {
    for (const ex of SAMPLE) {
      for (const answer of ex.answers) {
        expect(diagnoseNumberMiss(answer, ex)).toBeNull();
        expect(diagnoseNumberMiss(` ${stripDiacritics(answer).toUpperCase()}. `, ex)).toBeNull();
      }
    }
  });

  it("calls a blank answer empty", () => {
    for (const ex of SAMPLE) {
      expect(diagnoseNumberMiss("", ex)).toBe("empty");
      expect(diagnoseNumberMiss("   ", ex)).toBe("empty");
    }
  });

  it("counts the words before anything else", () => {
    for (const ex of SAMPLE) {
      expect(diagnoseNumberMiss(`${ex.answers[0]} i`, ex)).toBe("wordCount");
      if (ex.answers[0].includes(" ")) {
        expect(diagnoseNumberMiss(ex.answers[0].split(" ")[0], ex)).toBe("wordCount");
      }
    }
  });

  it("calls a dropped letter a typo", () => {
    for (const ex of SAMPLE) {
      const answer = ex.answers[0];
      const slip = answer.slice(0, -2) + answer.slice(-1); // the last-but-one letter dropped
      if (ex.answers.some((a) => loose(a) === loose(slip))) continue;
      // a dropped letter that lands on another real form is that form, not a typo
      const kind = diagnoseNumberMiss(slip, ex);
      expect(["typo", "government", "numeralForm"]).toContain(kind);
    }
  });

  it("leaves exercises of other drills alone", () => {
    const [ex] = buildSession({ cases: ["gen"], numbers: ["sg"], mode: "nouns", count: 1 }, 3);
    expect(diagnoseNumberMiss("", ex)).toBeNull();
    expect(diagnoseNumberMiss("kot", ex)).toBeNull();
    expect(diagnoseNumberMiss("", { ...ex, card: undefined })).toBeNull();
  });
});

describe("diagnoseNumberMiss: counting", () => {
  const counts = SAMPLE.filter((ex) => ex.card?.startsWith("numbers:count|"));

  it("calls any other form of the counted noun a government miss", () => {
    expect(counts.length).toBeGreaterThan(30);
    for (const ex of counts) {
      const noun = ex.source!.noun;
      const answers = ex.answers.map(loose);
      for (const number of NUMBERS) {
        for (const kase of CASES) {
          for (const form of nounVariants(noun, number, kase)) {
            if (answers.includes(loose(form))) continue;
            expect(diagnoseNumberMiss(form, ex), `${ex.before}[${form}]`).toBe("government");
          }
        }
      }
    }
  });

  it("pięć koty, dwa kotów, dwadzieścia dwa kotów, pięciu studenci", () => {
    const five = find("numbers:count|5+|nom", (ex) => drawn(ex) === 5);
    expect(diagnoseNumberMiss(nounVariants(five.source!.noun, "pl", "nom")[0], five)).toBe("government");
    expect(diagnoseNumberMiss(nounVariants(five.source!.noun, "sg", "nom")[0], five)).toBe("government");

    const two = find("numbers:count|2-4|acc", (ex) => drawn(ex) === 2);
    expect(diagnoseNumberMiss(nounVariants(two.source!.noun, "pl", "gen")[0], two)).toBe("government");

    const compound = builds("numbers:count|compound2-4|nom")[0];
    expect(diagnoseNumberMiss(nounVariants(compound.source!.noun, "pl", "gen")[0], compound)).toBe("government");

    const men = builds("numbers:count|men|nom")[0];
    expect(diagnoseNumberMiss(nounVariants(men.source!.noun, "pl", "nom")[0], men)).toBe("government");

    const teen = find(
      "numbers:count|teens|nom",
      (ex) => drawn(ex) === 12 && ex.source!.noun.pl!.nom !== ex.source!.noun.pl!.gen,
    );
    expect(diagnoseNumberMiss(nounVariants(teen.source!.noun, "pl", "nom")[0], teen)).toBe("government");
  });

  it("calls the right stem with an invented ending an ending miss", () => {
    const ex = find("numbers:count|5+|acc", (e) => e.source!.noun.lemma === "kot");
    expect(ex.answers).toEqual(["kotów"]);
    expect(diagnoseNumberMiss("kotek", ex)).toBe("ending");
    expect(diagnoseNumberMiss("kotó", ex)).toBe("typo");
    expect(diagnoseNumberMiss("pies", ex)).toBeNull(); // another word: no numbers-specific diagnosis
  });
});

describe("diagnoseNumberMiss: the numeral", () => {
  const numerals = SAMPLE.filter((ex) => ex.card?.startsWith("numbers:numeral|"));

  it("calls the same number in any other gender or case a numeral-form miss", () => {
    expect(numerals.length).toBeGreaterThan(30);
    for (const ex of numerals) {
      const n = drawn(ex);
      const answers = ex.answers.map(loose);
      for (const gender of GENDERS) {
        for (const kase of CASES) {
          for (const form of declineNumeral(n, gender, kase)) {
            if (answers.includes(loose(form))) continue;
            expect(diagnoseNumberMiss(form, ex), `${n} ${ex.tokens[1].text}: ${form}`).toBe("numeralForm");
          }
        }
      }
    }
  });

  it("dwa for dwie, dwaj or dwa for dwóch, dwoma for dwóm, pięciu for pięć", () => {
    const dwie = find("numbers:numeral|2-4|nom", (ex) => drawn(ex) === 2 && nounOf(ex).gender === "f");
    expect(dwie.answers).toEqual(["dwie"]);
    expect(diagnoseNumberMiss("dwa", dwie)).toBe("numeralForm");
    expect(diagnoseNumberMiss("dwóch", dwie)).toBe("numeralForm");

    const men = find("numbers:numeral|men|nom", (ex) => drawn(ex) === 2);
    expect(men.answers).toEqual(["dwóch"]);
    expect(diagnoseNumberMiss("dwaj", men)).toBe("numeralForm");
    expect(diagnoseNumberMiss("dwa", men)).toBe("numeralForm");

    const dative = find("numbers:numeral|2-4|dat", (ex) => drawn(ex) === 2);
    expect(dative.answers).toEqual(["dwóm"]);
    expect(diagnoseNumberMiss("dwoma", dative)).toBe("numeralForm");
    expect(diagnoseNumberMiss("dwóch", dative)).toBe("numeralForm");

    const five = find("numbers:numeral|5+|acc", (ex) => drawn(ex) === 5);
    expect(diagnoseNumberMiss("pięciu", five)).toBe("numeralForm");
    expect(diagnoseNumberMiss("pięcioma", five)).toBe("numeralForm");
  });

  it("does not take another number for a slip of form", () => {
    const sixteen = find("numbers:numeral|5+|gen", (ex) => drawn(ex) === 16);
    expect(sixteen.answers).toEqual(["szesnastu"]);
    expect(diagnoseNumberMiss("sześciu", sixteen)).toBeNull();
    expect(diagnoseNumberMiss("sześć", sixteen)).toBeNull();
    expect(diagnoseNumberMiss("szesnastoma", sixteen)).toBe("numeralForm");
    expect(diagnoseNumberMiss("szesnastami", sixteen)).toBe("ending");
  });

  it("calls the counted noun typed in the numeral's place a word-count miss", () => {
    const ex = numerals[0];
    expect(diagnoseNumberMiss(`${ex.answers[0]} ${ex.tokens[1].text}`, ex)).toBe("wordCount");
  });
});

describe("diagnoseNumberMiss: spelling", () => {
  const spell = (card: string, n: number) => find(card, (ex) => drawn(ex) === n);

  it("typo, ending, word count and another number", () => {
    const ex = find("numbers:spell|tens", (e) => drawn(e) === 23);
    expect(ex.answers).toEqual(["dwadzieścia trzy"]);
    expect(diagnoseNumberMiss("dwadziescia trzu", ex)).toBe("typo");
    expect(diagnoseNumberMiss("dwadzieście trzy", ex)).toBe("typo");
    expect(diagnoseNumberMiss("dwadziesta trzy", ex)).toBe("ending");
    expect(diagnoseNumberMiss("dwadzieściatrzy", ex)).toBe("wordCount");
    expect(diagnoseNumberMiss("dwadzieścia", ex)).toBe("wordCount");
    expect(diagnoseNumberMiss("trzydzieści trzy", ex)).toBe("other");
    expect(diagnoseNumberMiss("dwadzieścia cztery", ex)).toBe("other");
  });

  it("calls a teen spelled as the unit another number, and a garbled teen an ending", () => {
    const ex = spell("numbers:spell|teens", 16);
    expect(diagnoseNumberMiss("sześć", ex)).toBe("other");
    expect(diagnoseNumberMiss("szesnascie", ex)).toBeNull(); // diacritics only: graded on its own
    expect(diagnoseNumberMiss("szesnaście", ex)).toBeNull();
    expect(diagnoseNumberMiss("szesnacie", ex)).toBe("typo");
    expect(diagnoseNumberMiss("szesnastu", ex)).toBe("other"); // a real form of 16, not a spelling
  });

  it("calls tysiąc in the wrong counted form a government miss", () => {
    const two = find("numbers:spell|thousands2-4", (ex) => drawn(ex) % 1000 !== 0);
    const [head, , ...rest] = two.answers[0].split(" ");
    expect(diagnoseNumberMiss([head, "tysięcy", ...rest].join(" "), two)).toBe("government");

    const five = find("numbers:spell|thousands5+", () => true);
    const words = five.answers[0].split(" ");
    const i = words.indexOf("tysięcy");
    words[i] = "tysiące";
    expect(diagnoseNumberMiss(words.join(" "), five)).toBe("government");
  });

  it("never returns null for a wrong spelling", () => {
    for (const ex of SAMPLE.filter((e) => e.card?.startsWith("numbers:spell|"))) {
      expect(diagnoseNumberMiss("xyz", ex)).not.toBeNull();
    }
  });
});

describe("diagnoseNumberMiss: ordinals", () => {
  const ordinals = SAMPLE.filter((ex) => ex.card?.startsWith("numbers:ordinal|"));

  it("calls the same ordinal in any other gender, number or case a numeral-form miss", () => {
    expect(ordinals.length).toBeGreaterThan(20);
    for (const ex of ordinals) {
      const n = drawn(ex);
      const answers = ex.answers.map(loose);
      for (const gender of GENDERS) {
        for (const number of NUMBERS) {
          for (const kase of CASES) {
            const form = ordinal(n, gender, number, kase);
            if (answers.includes(loose(form))) continue;
            expect(diagnoseNumberMiss(form, ex), `${ex.id}: ${form}`).toBe("numeralForm");
          }
        }
      }
    }
  });

  it("dates, clock times and plain agreement", () => {
    const date = find("numbers:ordinal|date|gen", (ex) => drawn(ex) === 5);
    expect(date.answers).toEqual(["piątego"]);
    expect(diagnoseNumberMiss("piąty", date)).toBe("numeralForm");
    expect(diagnoseNumberMiss("pięć", date)).toBeNull(); // a cardinal: no numbers-specific diagnosis
    expect(diagnoseNumberMiss("piątgo", date)).toBe("typo");

    const late = find("numbers:ordinal|date|gen", (ex) => drawn(ex) === 21);
    expect(late.answers).toEqual(["dwudziestego pierwszego"]);
    expect(diagnoseNumberMiss("dwudziesty pierwszy", late)).toBe("numeralForm");
    expect(diagnoseNumberMiss("pierwszego", late)).toBe("wordCount");

    const time = find("numbers:ordinal|time|loc", (ex) => drawn(ex) === 3);
    expect(time.answers).toEqual(["trzeciej"]);
    expect(diagnoseNumberMiss("trzecia", time)).toBe("numeralForm");
    expect(diagnoseNumberMiss("trzeciego", time)).toBe("numeralForm");

    const plain = find("numbers:ordinal|plain|nom", (ex) => nounOf(ex)?.gender === "f");
    const n = drawn(plain);
    expect(diagnoseNumberMiss(ordinal(n, "mInanim", "sg", "nom"), plain)).toBe("numeralForm");
  });
});

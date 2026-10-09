# Lexicon data

Every word and sentence the drills draw from lives here, as plain JSON. The
grammar (endings, paradigms of pronouns, possessives and numerals, verb time
frames and conjugation) stays in `lib/`.

The files are imported statically (all of them in `lib/lexicon.ts`), so the
static export and offline use need no fetch. On load, `lib/load.ts` checks every entry and throws on the first bad one
with the file and the entry's lemma in the message, e.g.

```
data/nouns.json: "kot" needs 7 "sg" forms (nom..voc), got 6
```

`npm test` loads everything, so it is the quickest way to check an edit.

**Order matters.** Sessions are generated from a seed, and the generator walks
the lists in file order, so reordering entries (or the items of a list) changes
which sentences a given seed produces, and `lib/__tests__/golden.test.ts` will
say so. Adding entries changes them too; append new ones at the end of a file.

Optional fields are left out when they do not apply; don't write them as `null`
or `false`. Unknown fields are rejected, which catches typos like `noplural`.
Every entry of every file below may also carry `"review": "draft"`: see
[Drafts and review](#drafts-and-review).

**Layout.** Two-space indent, one entry per object, every entry spread over
lines; inside an entry a list of plain values (`"sg": [...]`) and an object of
plain values (`"past": { ... }`) stay on one line. `lib/review/format.ts`
writes exactly this, and the tests check every file round-trips through it
byte for byte, so the review scripts never reformat a file. Keep hand edits in
the same layout.

| File | Loaded by | Exports |
| --- | --- | --- |
| `nouns.json` | `lib/nouns.ts` | `NOUNS` |
| `adjectives.json` | `lib/adjectives.ts` | `ADJECTIVES` |
| `collocations.json` | `lib/adjectives.ts` | `COLLOCATIONS` |
| `templates.json` + `groups.json` | `lib/templates.ts` | `TEMPLATES` |
| `verbs.json` | `lib/verbs.ts` | `VERBS` |
| `agreement-frames.json` | `lib/agreement.ts` | `AGREEMENT_TEMPLATES` (demonstratives, possessives, ordinals) |
| `count-frames.json` | `lib/numbers.ts` | `COUNT_TEMPLATES` (the counting drill) |
| `numeral-frames.json` | `lib/numbers.ts` | `NUMERAL_TEMPLATES` (the numeral drill) |

All of them are loaded together by `loadLexicon` (`lib/load.ts`) in
`lib/lexicon.ts`, which every module above reads from.

## Levels and frequency

Every noun, adjective, verb and template has a CEFR `level` (`A1`, `A2`, `B1`
or `B2`); nouns, adjectives and verbs may also have a `freq` band from `1`
(everyday) to `5` (rare). A session with `maxLevel` set (`lvl=` in the URL) only
draws words and sentences at that level or below, and leaves out a case that
has no sentence there yet.

- A word's level is where a learner meets it on a standard A1–B2 syllabus:
  everyday concrete vocabulary (dom, kot, woda, dobry, robić) is A1.
- A template's level is the construction it drills, never lower than the point
  a learner meets that case after that trigger: "To jest ..." and the
  accusative after "mam / lubię" are A1; locative after "w / na" A1–A2;
  genitive, the instrumental ("z ...", "jestem + profession") and most dative
  frames A2; the vocative and rarer prepositions or verbs (przy, nad + ins,
  zależy mi na) B1–B2.
- A template must keep at least one fitting noun at its own level or below
  (`lib/__tests__/content.test.ts` checks this).

**These are provisional judgment calls.** In Phase 1 a native speaker reviews
the levels and `freq` is replaced with corpus frequency (the NKJP frequency
lists); until then treat both as a first draft.

## Drafts and review

New content goes in as a **draft**: `"review": "draft"` on the entry, which is
appended at the end of its file. A draft is in the files and passes the same
checks as everything else, but a learner never sees it until a native speaker
approves it.

- **Published** (the default: `npm run dev`, `npm run build`): `lib/lexicon.ts`
  exports the lexicon with every draft left out (`publish` in `lib/load.ts`),
  and with every reference to a draft word left out with it: a draft noun
  loses its collocations, a draft adjective drops out of every collocation
  list and `adjOnly`, and a draft noun out of `lemmas` / `excludeLemmas`
  (so also out of any `@group`). A sentence that named only draft nouns (no
  tags, every `lemmas` entry a draft) goes too; an `adjOnly` left empty means
  "no adjective", which still reads. Nothing published ever points at a draft.
- **Drafts in**: `NEXT_PUBLIC_INCLUDE_DRAFTS=1`. `npm run dev:drafts` runs the
  app that way; `NEXT_PUBLIC_INCLUDE_DRAFTS=1 npm run build` makes a preview
  build. Next.js inlines the value at build time (`next.config.ts` pins it, so
  a published build is fixed to "drafts out").
- **Tests** (`vitest.config.ts`) run twice over. The `published` project runs
  every test on the published lexicon, so the golden snapshot never moves for
  a draft. The `drafts` project runs the content gate
  (`lib/__tests__/content.test.ts`) and `drafts.test.ts` with drafts in, so a
  malformed or unusable draft fails `npm test` before anyone reviews it.
  Run one with `npx vitest run --project drafts`.

### The review sheet

```
npm run review:export                       # writes review/pending.csv
npm run review:import review/pending.csv    # applies the verdicts
```

`review:export` writes one row per draft to `review/pending.csv` (or the path
given after it), UTF-8 with a byte-order mark and standard CSV quoting, so it
opens in Google Sheets (File → Import) or Excel with the Polish letters
intact. The columns:

| Column | Holds |
| --- | --- |
| `kind` | `noun`, `adjective`, `verb`, `template`, `agreement-frame`, `count-frame` or `numeral-frame` |
| `id` | How the import finds the entry again: the lemma; `pisać / napisać` for a verb pair; `acc/any: Widzę {NP}.` (case/number: sentence) for a template or agreement frame; the sentence for a count frame; the case for a numeral frame. **Don't edit it.** |
| `file` | Where the entry lives. |
| `level`, `freq` | As in the entry. |
| `en` | The English gloss(es). |
| `forms` | Every form, one line per row of the paradigm: `sg: nom=kot gen=kota …` for a noun, every gender and number of an adjective, both aspects of a verb with their objects, a frame's fields. |
| `example1`..`example3` | Sentences the real generator builds with the entry, answer filled in, English after the dash: for a noun or an adjective sentences that use it, for a template or frame sentences from it, for a verb the present, past and future. |
| `verdict` | Empty for the reviewer: `ok`, `fix` or `reject`. |
| `correction` | Empty for the reviewer: what is wrong, for `fix`. |

The reviewer fills in `verdict` (and `correction` for a fix), exports the
sheet back to CSV (comma or semicolon separated, either works) and
`review:import` applies it:

- `ok` removes the `review` field: the entry is published.
- `reject` deletes the entry. A rejected noun also loses its line in
  `collocations.json` and a rejected adjective its place in every list there;
  any template, frame or group that still names the word is reported, and the
  import exits with an error until it is fixed by hand. Only drafts can be
  rejected: a published entry is never deleted this way.
- `fix` changes nothing: it prints the correction with the entry's file and
  line (`data/verbs.json:24 verb "pisać / napisać": …`) for a human or an
  agent to make. The entry stays a draft and comes back in the next export.
- An empty verdict skips the row.

Running the import again on the same sheet changes nothing more: an approved
entry is no longer a draft and a rejected one is gone. Files are written back
in the layout above, so the diff shows only what the verdicts changed.

Approving drafts changes the published lexicon, so the golden snapshot moves:
check the diff, then update it (`npx vitest run -u`) in the same commit.

The scripts live in `scripts/` and run with `tsx`; the logic they call is in
`lib/review/` (`csv.ts`, `format.ts`, `entries.ts` for the import,
`export.ts` for the sheet) and is tested in `lib/__tests__/review.test.ts`.
`review/*.csv` is git-ignored: the sheets are working files, not history.

## nouns.json

A list of nouns, one object each.

```json
{
  "lemma": "kot",
  "en": "cat",
  "enPl": "cats",
  "level": "A1",
  "freq": 2,
  "gender": "mAnim",
  "tags": ["animal"],
  "sg": ["kot", "kota", "kotu", "kota", "kotem", "kocie", "kocie"],
  "pl": ["koty", "kotów", "kotom", "koty", "kotami", "kotach", "koty"]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `lemma` | yes | Nominative singular; must be unique. Templates and collocations refer to the noun by it. |
| `en`, `enPl` | yes | English singular and plural, without article. |
| `level` | yes | CEFR level: `A1`, `A2`, `B1` or `B2` (see [Levels and frequency](#levels-and-frequency)). |
| `freq` | no | Frequency band, `1` (most common) to `5`. |
| `gender` | yes | `mPers` (masculine personal), `mAnim` (animate), `mInanim` (inanimate), `f` or `n`. |
| `tags` | yes | What the noun is, so templates only pick nouns that fit (may be `[]`). One of `person`, `profession`, `animal`, `food`, `drink`, `placeIn` (takes "w" + locative), `placeTo` (sensible with "do" + genitive), `surface` ("na" / "pod" / "nad"), `vehicle`, `object` (portable things you can buy, own or hold), `text`, `abstract`, `family` (relatives: English glosses them as "my ..."), `friend`, `topic` (muzyka, historia, sport...), `show` (film, mecz, serial), `time`, `body`, `plant`, `water` (morze, jezioro, rzeka). The list lives in `TAGS` in `lib/types.ts`. |
| `sg` | yes | The 7 singular forms, **always in this order: nom, gen, dat, acc, ins, loc, voc**. |
| `pl` | unless `noPlural` | The 7 plural forms, same order. |
| `mass` | no | `true` for a mass noun: never gets "a/an" in the English gloss, stays singular in the case drill, and is never counted (count, numeral and ordinal drills) unless it has `portions` or the frame names it in `lemmas`. |
| `portions` | no | `true` for a `mass` noun (with `pl`) that is still counted in servings, loaves or bars: dwie kawy, trzy piwa, pięć chlebów. Not for trawa, woda or zupa: "dziewiętnaście traw" is no sentence. |
| `noPlural` | no | `true` when the plural is not used in practice (mleko, muzyka). Leave out `pl` then. |
| `onlySg` | no | `true` when there is a plural, but not one a sentence about "my ..." can use (matki, żony), or one the case drill should not drill (the seasons: "To są wiosny", "lata" = years). |
| `article` | no | The English article the noun takes in the singular, whatever the sentence asks for (`{np}`, `{npDef}` or `{npBare}`). `"none"`: the seasons, "I like spring", "until winter", never "a spring" (an adjective lifts it: "a cold spring", "the long winter"). `"the"`: always definite, adjective or not, where the `topic` / `abstract` rule would leave it bare: "the economy", "the Polish economy", "the environment". Leave it out for the usual rules (a/an, the; `topic` / `abstract` bare, `family` / `friend` "my"). |
| `noPossessive` | no | `true` when no possessive in front of it reads naturally: people you do not own (Polak, człowiek, pan), wild animals (lew, komar), geography (ocean), time (godzina, wiosna). The possessive drill skips it; the demonstrative and ordinal drills still use it ("Widzę tego człowieka"). |
| `alt` | no | Extra accepted answers per cell, keyed `"<sg\|pl>.<case>"`: `{ "pl.gen": ["pokojów"] }`. |
| `review` | no | `"draft"` until a native speaker approves it (see [Drafts and review](#drafts-and-review)). Same on every kind of entry below. |

## adjectives.json

A list of adjectives. Only the stem and its type are stored; the endings come
from `lib/declineAdjective.ts`.

```json
{ "lemma": "dobry", "en": "good", "level": "A1", "freq": 1, "stem": "dobr", "type": "hard", "virilePl": "dobrzy" }
```

| Field | Required | Meaning |
| --- | --- | --- |
| `lemma` | yes | Masculine nominative singular. |
| `en` | yes | English gloss. A gloss starting "other" (inny) fuses with the article: "another plate", "the other plate", "other plates". |
| `level`, `freq` | `level` only | As for nouns. |
| `stem` | yes | The lemma minus its ending: dobry → dobr, tani → tan, drogi → drog. |
| `type` | yes | `hard` (dobry), `soft` (tani) or `velar` (drogi, polski: -k/-g stems). |
| `virilePl` | yes | Masculine-personal nominative plural, the one form rules cannot derive reliably (dobrzy, polscy). |
| `state` | no | `true` for a passing condition or looks (chory, wysoki): only used in templates that set `states`. |
| `address` | no | `true` when only used to address someone (kochany): only where a template asks for it. |

## collocations.json

Which adjectives a Polish speaker would actually put in front of each noun,
keyed by noun lemma; every adjective must exist in `adjectives.json`. A noun
missing here, or with an empty list, never gets an adjective: better no
sentence than "niebieska zupa".

```json
{ "kot": ["czarny", "biały", "mały"], "głowa": [] }
```

## templates.json

A list of sentence frames for the case drill.

```json
{
  "case": "voc",
  "number": "any",
  "level": "B1",
  "pl": "Dobranoc, {NP}.",
  "en": "Good night, {npBare}.",
  "requires": ["family"],
  "excludeLemmas": ["@noVocative"],
  "adjOnly": ["@dear"],
  "note": "Addressing someone directly takes the vocative."
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `case` | yes | The case drilled: `nom`, `gen`, `dat`, `acc`, `ins`, `loc` or `voc`. |
| `number` | yes | `sg`, `pl` or `any`. |
| `level` | yes | CEFR level of the construction drilled (no `freq`). |
| `pl` | yes | The Polish sentence with one `{NP}` slot, never first (capitalisation stays fixed). `{z}` and `{w}` are prepositions that grow an -e before consonant clusters (z psem, ze starym psem). |
| `en` | yes | English gloss with exactly one of `{np}` (a/an/some), `{npDef}` (the) or `{npBare}` (no article). An adjective glossed best, worst, last, next, previous, same, only or whole makes `{np}` definite too ("Over there is the last train", "I can see my best mate"); a noun's own `article` wins over all three. |
| `enPl` | no | English gloss to use instead when the noun phrase is plural. |
| `requires` | yes | Tags; the noun must carry at least one. `[]` with no `lemmas` means any noun. |
| `lemmas` | no | Nouns that fit even without a matching tag. |
| `excludeLemmas` | no | Nouns that have a matching tag but don't fit this sentence (w ulicy, przed kuchnią). |
| `states` | no | `true` lets `state` adjectives in: "Opiekuję się chorą babcią", not "Kocham chorego psa". |
| `adjOnly` | no | Only these adjectives make sense here; `[]` means no adjective at all. |
| `note` | yes | One line on why this case is used here. |
| `subject` | no | `"1sg"` when the sentence has a first-person singular subject. |

Every sentence should name the nouns it suits (`requires` / `lemmas`): a
sentence a Pole would never say ("Gdzie jest noc?") is worse than no sentence.

### Groups

Lists used by several templates have a name, and a template refers to one as
`"@name"` inside any of its lists. The loader splices the group's items in at
that spot, keeping order, so `["@close", "profession"]` means
`["family", "friend", "profession"]`. An unknown name is an error.

Named groups live in `groups.json`, as `{ "name": [items] }`; a group cannot
refer to another group.

| Group | Used in | Items |
| --- | --- | --- |
| `@tangible` | `requires` | Things you can see, point at or find lying around. |
| `@close` | `requires` | People you'd call by name: close family and friends. |
| `@noVocative` | `excludeLemmas` | Never addressed this way: "matko" / "ojcze" are church Polish, "żono" / "mężu" archaic. |
| `@dear` | `adjOnly` | The only adjective that sits naturally in a greeting: "kochana babciu". |
| `@workplaces` | `lemmas` | Places you work in: "Pracuję w banku". |
| `@meetingPlaces` | `lemmas` | Somewhere to meet up. |
| `@relatives` | `excludeLemmas` | **Derived, not in the file**: every noun tagged `family`, in `nouns.json` order (defined in `loadLexicon`, `lib/load.ts`). Relatives need a possessive in English: "This is a husband" is no sentence. |
| `@notHere` | `excludeLemmas` | Count / numeral frames: what could not sit "here" ("Tu są trzy krzesła", not "Tu są dwa miasta"). |
| `@inView` | `requires` | Count / numeral frames: what you'd see out of a window or in a photo. |
| `@notInView` | `excludeLemmas` | ...and what you would not. |
| `@notCounted` | `excludeLemmas` | People you would not help or talk to in a group of five: pan, pani, rodzina. |
| `@seasons` | `lemmas` | The four seasons: "Lubię wiosnę", "Tęsknię za latem". |
| `@meals` | `lemmas` | Meals, which take no article in English: "before dinner", "after breakfast". |
| `@womenAtWork` | `lemmas` | Feminine job titles, tagged `person` rather than `profession`: "Ona jest lekarką". |
| `@kin` | `excludeLemmas` | Count / numeral frames: relatives nobody has dozens of ("pięćdziesiąt dwie wnuczki", "dziewięćdziesiąt cioć"). |
| `@notThis` | `excludeLemmas` | "To jest ..." / "Czy to są ...": fields and ideas ("To jest prawda" means "that's true"), body parts ("This is a left shoulder"), hours and minutes ("To jest minuta") and the seasons (they have "Już jest ..."). |

Groups work the same way in the three frame files below.

## agreement-frames.json

The frames of the drills where the noun is handed over already declined and
the blank is a word that agrees with it: demonstratives (ten / tamten),
possessives and ordinals. One plain trigger per case, so the only thing tested
is the agreement. Same schema as `templates.json`; each is levelled like the
case it drills there.

All three drills honour a frame's `requires`, `lemmas` and `excludeLemmas`
(`"excludeLemmas": ["godzina", "minuta"]` keeps "Myślę o naszej godzinie" out),
and `publish` strips draft nouns from both lists as it does for templates. The
ordinal drill also skips a `mass` noun without `portions` ("Widzę jedenastą
trawę"), and the possessive drill a `noPossessive` noun ("Tu jest mój Polak").
For a word that only clashes with a possessive, mark the noun `noPossessive`
rather than excluding it from the frame, so the demonstrative drill keeps it.

## count-frames.json

The sentences of the counting drill ("Mam pięć kotów").

```json
{
  "pl": "Mam {N} {NP}.",
  "en": "I have {np}.",
  "case": "acc",
  "requires": ["animal", "object", "vehicle", "text", "food"],
  "lemmas": ["dom", "mieszkanie", "pokój"],
  "excludeLemmas": ["słoń", "zwierzę"]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `pl` | yes | Polish with `{N}` for the numeral and `{NP}` for the counted noun; `{V}` becomes "jest" or "są". |
| `en` | yes | English with `{np}` for the counted phrase ("five cats"); `{is}` becomes "is" or "are". |
| `case` | yes | The case the frame itself assigns, `nom` or `acc`: it only shows with "jeden". |
| `requires`, `lemmas`, `excludeLemmas` | `requires` only | Which nouns fit, as in `templates.json`. A `mass` noun fits only with `portions` or when `lemmas` names it. |

## numeral-frames.json

The numeral drill's one sentence per case, keyed by case: `{ "gen": { ... } }`.
Each has `pl` (with `{NP}` for numeral + noun, `{V}` for "jest" / "są" and
`{z}` for the preposition), `en` (`{np}`, `{is}`) and the same noun filter.
The drill asks for `nom` to `loc`; `voc` is there for completeness and never
drawn. A case whose frame is a draft has no numeral question until it is
approved.

## verbs.json

A list of aspect pairs, or imperfective verbs on their own. Polish conjugation
is too irregular to derive from the infinitive, so each verb stores its
principal parts and `lib/verbs.ts` builds the rest. In error messages a verb is
named by its imperfective infinitive.

```json
{
  "en": { "base": "write", "past": "wrote", "ing": "writing" },
  "level": "A1",
  "freq": 1,
  "impf": {
    "inf": "pisać",
    "past": { "m": "pisał", "f": "pisała", "vir": "pisali" },
    "pres": ["piszę", "piszesz", "piszą"],
    "imp": "pisz"
  },
  "pf": {
    "inf": "napisać",
    "past": { "m": "napisał", "f": "napisała", "vir": "napisali" },
    "pres": ["napiszę", "napiszesz", "napiszą"],
    "imp": "napisz"
  },
  "objects": [{ "pl": "list", "neg": "listu", "en": "a letter" }]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `en` | yes | English `base`, simple `past` and `ing` form. The base may be several words (come back, look after; the 3sg inflects the first: comes back). A "be" base (`"be late"`, `"be afraid of"`) has no `past` or `ing`: "be" is conjugated per subject (am / is / are late, was / were late, will be late, don't be late). |
| `level`, `freq` | `level` only | As for nouns, for the aspect pair as a whole. |
| `impf` | yes | The imperfective verb, with the fields below. |
| `pf` | no | The perfective partner, same fields. Left out for a verb drilled without one (chodzić, mieszkać, wiedzieć, lubić): it has no simple future and no perfective past frame ("Wczoraj"), and is simply not drawn for a tense it has no frame in. |
| ↳ `inf` | yes | Infinitive, with "się" on reflexive verbs (uczyć się). |
| ↳ `past` | yes | 3sg masculine `m` (pisał), feminine `f` (pisała), masculine-personal plural `vir` (pisali), and `m1` only when the stem before -em / -eś differs from `m` (mógł → mogłem). |
| ↳ `pres` | yes | Non-past 1sg, 2sg, 3pl: the present for `impf`, the future for `pf`. |
| ↳ `imp` | no | 2sg imperative; left out when not in use, or when no order with the verb's objects makes sense (zrozum zadanie!, widź morze!). A verb with no `imp` on either aspect is never drilled in the imperative. |
| `objects` | yes | At least one complement: Polish `pl`, `neg` when a negated verb changes it (list → nie pisz listu), English `en`. `pl` is written in the case the verb governs, so it need not be an accusative: `psów` after bać się (gen), `mamie` after wierzyć (dat), `muzyką` after interesować się (ins), `o kluczach` after pamiętać. Only an accusative changes after "nie", so only an accusative gets `neg`. |
| `reflexive` | no | `true` for verbs with "się" (uczyć się). |
| `motion` | no | `true` for determinate motion (iść, jechać): no habits, no stretches of time. |
| `indeterminate` | no | `true` for indeterminate motion (chodzić, jeździć): habits only ("Codziennie chodzę do pracy", "Wtedy jeździłem autobusem"), never one trip now. Has no `pf`. |
| `momentary` | no | `true` when it is over in a moment (wracać): no "all evening" frames. |
| `stative` | no | `true` for a state, not an action (wiedzieć, znać, lubić, widzieć, mieszkać, bać się): English keeps the simple present ("I understand now", never "I am understanding"), no "all evening" / "every day" / "usually" frames, so no compound future; instead "Chyba ..." (I think ...) in the present and "Wtedy ..." (at that time) in the past. |
| `orders` | no | `"negated"` when only a prohibition sounds right (nie martw się!, nie spóźniaj się!, nie chodź tam!), `"affirmative"` when only a positive order does (pamiętaj o kluczach!). Left out, both are drilled. |

## Adding an entry

1. Append the object to the end of the right file, following the schema above,
   with `"review": "draft"` as its last field.
   For a noun, write all 7 forms of each number in nom, gen, dat, acc, ins, loc,
   voc order, and give it the tags that let the right templates pick it. Give
   every entry a `level`.
2. For a noun that should take adjectives, add its lemma to `collocations.json`.
3. Run `npm test`. A malformed entry fails with its lemma in the message; the
   lexicon tests then check that templates only name existing words and that
   every tag a template requires is carried by enough nouns, and the content
   gate (`lib/__tests__/content.test.ts`) that every level still fills a
   20-question session in every drill without a broken sentence.
4. A draft never changes `golden.test.ts`: it runs on the published lexicon.
   When drafts are approved (`npm run review:import`) the sessions generated
   for the fixed seeds change; that is expected: check the diff, then update
   the snapshot on purpose.

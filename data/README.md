# Lexicon data

Every word and sentence the drills draw from lives here, as plain JSON. The
grammar (endings, paradigms of pronouns, possessives and numerals, verb time
frames and conjugation) stays in `lib/`.

The files are imported statically, so the static export and offline use need no
fetch. On load, `lib/load.ts` checks every entry and throws on the first bad one
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

| File | Loaded by | Exports |
| --- | --- | --- |
| `nouns.json` | `lib/nouns.ts` | `NOUNS` |
| `adjectives.json` | `lib/adjectives.ts` | `ADJECTIVES` |
| `collocations.json` | `lib/adjectives.ts` | `COLLOCATIONS` |
| `templates.json` + `groups.json` | `lib/templates.ts` | `TEMPLATES` |
| `verbs.json` | `lib/verbs.ts` | `VERBS` |

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
| `mass` | no | `true` for a mass noun: never gets "a/an" in the English gloss. |
| `noPlural` | no | `true` when the plural is not used in practice (mleko, muzyka). Leave out `pl` then. |
| `onlySg` | no | `true` when there is a plural, but not one a sentence about "my ..." can use (matki, żony). |
| `alt` | no | Extra accepted answers per cell, keyed `"<sg\|pl>.<case>"`: `{ "pl.gen": ["pokojów"] }`. |

## adjectives.json

A list of adjectives. Only the stem and its type are stored; the endings come
from `lib/declineAdjective.ts`.

```json
{ "lemma": "dobry", "en": "good", "level": "A1", "freq": 1, "stem": "dobr", "type": "hard", "virilePl": "dobrzy" }
```

| Field | Required | Meaning |
| --- | --- | --- |
| `lemma` | yes | Masculine nominative singular. |
| `en` | yes | English gloss. |
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
| `en` | yes | English gloss with exactly one of `{np}` (a/an/some), `{npDef}` (the) or `{npBare}` (no article). |
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
| `@relatives` | `excludeLemmas` | **Derived, not in the file**: every noun tagged `family`, in `nouns.json` order (defined in `lib/templates.ts`). Relatives need a possessive in English: "This is a husband" is no sentence. |

## verbs.json

A list of aspect pairs. Polish conjugation is too irregular to derive from the
infinitive, so each verb stores its principal parts and `lib/verbs.ts` builds the
rest. In error messages a verb is named by its imperfective infinitive.

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
| `en` | yes | English `base`, simple `past` and `ing` form. |
| `level`, `freq` | `level` only | As for nouns, for the aspect pair as a whole. |
| `impf`, `pf` | yes | The imperfective and perfective verb, each with: |
| ↳ `inf` | yes | Infinitive (without "się"). |
| ↳ `past` | yes | 3sg masculine `m` (pisał), feminine `f` (pisała), masculine-personal plural `vir` (pisali), and `m1` only when the stem before -em / -eś differs from `m` (mógł → mogłem). |
| ↳ `pres` | yes | Non-past 1sg, 2sg, 3pl: the present for `impf`, the future for `pf`. |
| ↳ `imp` | no | 2sg imperative; left out when not in use. |
| `objects` | yes | At least one complement: Polish `pl`, `neg` when a negated verb changes it (list → nie pisz listu), English `en`. |
| `reflexive` | no | `true` for verbs with "się" (uczyć się). |
| `motion` | no | `true` for determinate motion (iść, jechać): no habits, no stretches of time. |
| `momentary` | no | `true` when it is over in a moment (wracać): no "all evening" frames. |

## Adding an entry

1. Append the object to the end of the right file, following the schema above.
   For a noun, write all 7 forms of each number in nom, gen, dat, acc, ins, loc,
   voc order, and give it the tags that let the right templates pick it. Give
   every entry a `level`.
2. For a noun that should take adjectives, add its lemma to `collocations.json`.
3. Run `npm test`. A malformed entry fails with its lemma in the message; the
   lexicon tests then check that templates only name existing words and that
   every tag a template requires is carried by enough nouns, and the content
   gate (`lib/__tests__/content.test.ts`) that every level still fills a
   20-question session in every drill without a broken sentence.
4. If `golden.test.ts` fails, the new entry changed the sessions generated for
   the fixed seeds. That is expected when adding content: check the diff, then
   update the snapshot on purpose.

import Link from "next/link";
import { ExampleList, GuideLayout, Pl, PractiseLink, Section, TD, TH, TableBox } from "@/components/Guide";
import {
  cardinalTable,
  countTable,
  dateTable,
  hourTable,
  monthTable,
  numberExamples,
  numberPracticeHref,
  obliqueExample,
  ordinalTable,
} from "@/lib/guides";
import { pageMetadata } from "@/lib/site";

const PATH = "/polish-numbers";

export const metadata = pageMetadata({
  title: "Polish numbers: 2–4 vs 5+, ordinals and dates",
  description:
    "How Polish numbers change the noun after them (the 1 / 2–4 / 5+ rule), numbers for groups of men, cardinals to 5000, ordinals, dates and telling the time, with examples.",
  path: PATH,
});

export default function PolishNumbersPage() {
  const count = countTable();
  const dates = dateTable();
  const oblique = obliqueExample();
  return (
    <GuideLayout
      path={PATH}
      eyebrow="Grammar guide"
      title="Polish numbers: the noun after them, ordinals and dates"
      intro={
        <>
          <p>
            Saying a number in Polish is the easy part. The hard part is what happens to the noun after
            it: one cat, two cats and five cats are three different forms, and the rule depends on the
            last digit, not on the size of the number.
          </p>
          <p>Every form below is produced by the grammar code the drills use.</p>
        </>
      }
    >
      <Section id="rule" title="The 1 / 2–4 / 5+ rule">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>1</strong> takes the nominative singular, and the number itself agrees in gender.
          </li>
          <li>
            <strong>2, 3, 4</strong>, and any number ending in them (22, 34, 103), take the nominative
            plural. Except 12, 13 and 14, which count as 5+.
          </li>
          <li>
            <strong>5 and up</strong> (and 11–19, the round tens and hundreds, and anything ending in 0, 1
            or 5–9 above 20) take the genitive plural. So 21 is “twenty-one cats” with the 5+ form.
          </li>
          <li>
            <strong>Groups including men</strong> are the exception: from 2 up the number takes a special
            form and the noun is always genitive plural.
          </li>
        </ul>
        <TableBox caption="Number + noun, nominative (“there are …”)">
          <thead>
            <tr>
              <th className={TH}>Number</th>
              {count.nouns.map((n) => (
                <th key={n.lemma} className={TH}>
                  {n.en}
                </th>
              ))}
              <th className={TH}>Noun form</th>
            </tr>
          </thead>
          <tbody>
            {count.rows.map((row) => (
              <tr key={row.n}>
                <td className={`${TD} font-medium`}>{row.n}</td>
                {row.cells.map((cell, i) => (
                  <td key={i} className={`${TD} sentence min-w-[9rem] text-base`}>
                    <Pl>{cell}</Pl>
                  </td>
                ))}
                <td className={`${TD} text-muted`}>{row.band}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <p className="text-sm text-muted">
          The last column is for the other nouns; the first column (a group with men) is genitive plural
          from 2 up.
        </p>
        <ExampleList examples={numberExamples("count")} />
        <div className="flex flex-wrap items-center gap-4">
          <PractiseLink href={numberPracticeHref(["count"])}>Practise the noun after a number</PractiseLink>
        </div>
      </Section>

      <Section id="numeral-cases" title="The number has cases too">
        <p>
          After a preposition or a verb that wants another case, the number changes along with the noun:
          from 5 up most cases share one form (<Pl>{oblique.base}</Pl> → <Pl>{oblique.form}</Pl>), and 2, 3
          and 4 have their own.
        </p>
        <ExampleList examples={numberExamples("numeral", 4, 3)} />
        <PractiseLink href={numberPracticeHref(["numeral"])}>Practise the numbers in every case</PractiseLink>
      </Section>

      <Section id="cardinals" title="Counting: 1 to 5000">
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>Number</th>
              <th className={TH}>Polish</th>
              <th className={TH}>English</th>
            </tr>
          </thead>
          <tbody>
            {cardinalTable().map((row) => (
              <tr key={row.n}>
                <td className={`${TD} font-medium`}>{row.n}</td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.pl}</Pl>
                </td>
                <td className={`${TD} text-muted`}>{row.en}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <p className="text-muted">
          Bigger numbers are built from the parts, in order, with no “and”. Even the word for a thousand
          follows the 1 / 2–4 / 5+ rule.
        </p>
        <PractiseLink href={numberPracticeHref(["spell"])}>Practise writing numbers out</PractiseLink>
      </Section>

      <Section id="ordinals" title="Ordinals: first, second, third">
        <p>
          Ordinals are adjectives: they agree with the noun in gender, number and case. In a compound
          ordinal both words change.
        </p>
        <TableBox>
          <thead>
            <tr>
              <th className={TH}></th>
              <th className={TH}>English</th>
              <th className={TH}>masculine</th>
              <th className={TH}>feminine</th>
              <th className={TH}>neuter</th>
            </tr>
          </thead>
          <tbody>
            {ordinalTable().map((row) => (
              <tr key={row.n}>
                <td className={`${TD} font-medium`}>{row.n}.</td>
                <td className={`${TD} text-muted`}>{row.en}</td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.m}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.f}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.neut}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </Section>

      <Section id="dates" title="Dates">
        <p>
          A date is the day as an ordinal in the genitive, then the month in the genitive: literally “of
          the third of May”.
        </p>
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>English</th>
              <th className={TH}>Polish</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((d) => (
              <tr key={d.en}>
                <td className={`${TD} text-muted`}>{d.en}</td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{d.pl}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <TableBox caption="The months: the name, and the form used in a date">
          <thead>
            <tr>
              <th className={TH}>Month</th>
              <th className={TH}>Name</th>
              <th className={TH}>In a date</th>
            </tr>
          </thead>
          <tbody>
            {monthTable().map((m) => (
              <tr key={m.en}>
                <td className={`${TD} text-muted`}>{m.en}</td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{m.nom}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{m.gen}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </Section>

      <Section id="time" title="Telling the time">
        <p>
          The hour is a feminine ordinal, agreeing with the unspoken word for “hour”: the nominative for
          “it’s … o’clock”, the locative for “at … o’clock”.
        </p>
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>Hour</th>
              <th className={TH}>It’s … o’clock</th>
              <th className={TH}>At … o’clock</th>
            </tr>
          </thead>
          <tbody>
            {hourTable().map((h) => (
              <tr key={h.en}>
                <td className={`${TD} text-muted`}>{h.en}</td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{h.nom}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{h.loc}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <ExampleList examples={numberExamples("ordinal", 4, 17)} />
        <div className="flex flex-wrap items-center gap-4">
          <PractiseLink href={numberPracticeHref(["ordinal"])}>Practise ordinals, dates and the time</PractiseLink>
          <Link href="/numbers" className="text-accent underline underline-offset-4">
            Set up a numbers session
          </Link>
        </div>
      </Section>
    </GuideLayout>
  );
}

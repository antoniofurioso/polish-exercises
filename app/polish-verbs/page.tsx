import Link from "next/link";
import { ExampleList, GuideLayout, Pl, PractiseLink, Section, TD, TH, TableBox } from "@/components/Guide";
import {
  TENSE_LABEL,
  aspectPairs,
  conjugation,
  reflexiveSample,
  verbExamples,
  verbPracticeHref,
} from "@/lib/guides";
import { pageMetadata } from "@/lib/site";

const PATH = "/polish-verbs";

export const metadata = pageMetadata({
  title: "Polish verbs: aspect, past, future, imperative",
  description:
    "Polish verb aspect explained with the commonest aspect pairs, then full tables of the present, past, both futures and the imperative, with example sentences in English.",
  path: PATH,
});

/** The verbs the example sentences are built from: common, both aspects. */
const EXAMPLE_VERBS = ["pisać", "robić", "czytać", "jeść", "kupować"];

export default function PolishVerbsPage() {
  const c = conjugation();
  const pairs = aspectPairs();
  const reflexive = reflexiveSample();
  return (
    <GuideLayout
      path={PATH}
      eyebrow="Grammar guide"
      title="Polish verbs: aspect, past, future and imperative"
      intro={
        <>
          <p>
            Most Polish verbs come in pairs: an imperfective verb for an action in progress, repeated or
            seen as a whole stretch of time, and a perfective verb for one action that gets finished. Pick
            the aspect first, then the tense.
          </p>
          <p>Every form below is produced by the grammar code the drills use.</p>
        </>
      }
    >
      <Section id="aspect" title="Aspect: imperfective and perfective">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Imperfective</strong>: what is going on, what happens regularly, or how long something
            went on. It has a present tense, a past, a compound future and an imperative.
          </li>
          <li>
            <strong>Perfective</strong>: one action, done and finished, with a result. It has no present:
            its present-looking forms are the future. So it has a past, a simple future and an imperative.
          </li>
        </ul>
        <TableBox caption="Common aspect pairs">
          <thead>
            <tr>
              <th className={TH}>English</th>
              <th className={TH}>Imperfective</th>
              <th className={TH}>Perfective</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={p.impf}>
                <td className={`${TD} text-muted`}>{p.en}</td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{p.impf}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{p.pf}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </Section>

      <Section
        id="present"
        title={
          <>
            Present tense <Pl className="font-normal text-muted">({TENSE_LABEL.present})</Pl>
          </>
        }
      >
        <p>
          Only imperfective verbs have a present. One form covers “I write”, “I am writing” and “I have been
          writing”. Here is <Pl className="font-medium">{c.impf}</Pl> (to {c.en}):
        </p>
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>Person</th>
              <th className={TH}>
                Present: <Pl>{c.impf}</Pl>
              </th>
            </tr>
          </thead>
          <tbody>
            {c.nonPast.map((row) => (
              <tr key={row.who}>
                <td className={`${TD} text-muted`}>
                  <Pl>{row.who}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.present}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <ExampleList examples={verbExamples("present", EXAMPLE_VERBS.slice(0, 3))} />
        <PractiseLink href={verbPracticeHref(["present"])}>Practise the present tense</PractiseLink>
      </Section>

      <Section
        id="past"
        title={
          <>
            Past tense <Pl className="font-normal text-muted">({TENSE_LABEL.past})</Pl>
          </>
        }
      >
        <p>
          Both aspects have a past. The ending shows the person and the gender of the subject: a woman
          and a man say “I wrote” differently, and in the plural a group with any men in it has its own
          form.
        </p>
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>Subject</th>
              <th className={TH}>
                Imperfective: <Pl>{c.impf}</Pl>
              </th>
              <th className={TH}>
                Perfective: <Pl>{c.pf}</Pl>
              </th>
            </tr>
          </thead>
          <tbody>
            {c.past.map((row) => (
              <tr key={row.who}>
                <td className={`${TD} whitespace-nowrap text-muted`}>
                  <Pl>{row.who}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.impf}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.pf}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <p className="text-sm text-muted">♂ a man or a group with a man in it · ♀ a woman or a group of women.</p>
        <ExampleList examples={verbExamples("past", EXAMPLE_VERBS)} />
        <PractiseLink href={verbPracticeHref(["past"])}>Practise the past tense</PractiseLink>
      </Section>

      <Section
        id="future"
        title={
          <>
            Two futures{" "}
            <Pl className="font-normal text-muted">
              ({TENSE_LABEL.future}, {TENSE_LABEL.futureCompound.toLowerCase()})
            </Pl>
          </>
        }
      >
        <p>
          The perfective future is simple: it looks like a present tense. The imperfective future is
          compound: the future of “to be” plus either the infinitive or the past form. Both compound
          versions are standard.
        </p>
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>Person</th>
              <th className={TH}>
                Simple (perfective): <Pl>{c.pf}</Pl>
              </th>
              <th className={TH}>
                Compound (imperfective): <Pl>{c.impf}</Pl>
              </th>
            </tr>
          </thead>
          <tbody>
            {c.nonPast.map((row) => (
              <tr key={row.who}>
                <td className={`${TD} text-muted`}>
                  <Pl>{row.who}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.future}</Pl>
                </td>
                <td className={`${TD} sentence min-w-[12rem] text-base`}>
                  <Pl>{row.compound.join(" / ")}</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <ExampleList
          examples={[
            ...verbExamples("future", EXAMPLE_VERBS.slice(0, 3)),
            ...verbExamples("futureCompound", EXAMPLE_VERBS.slice(2, 5)),
          ]}
        />
        <PractiseLink href={verbPracticeHref(["future", "futureCompound"])}>Practise both futures</PractiseLink>
      </Section>

      <Section
        id="imperative"
        title={
          <>
            Imperative <Pl className="font-normal text-muted">({TENSE_LABEL.imperative})</Pl>
          </>
        }
      >
        <p>
          Orders and requests to one person, to several, and “let’s”. A positive request usually takes the
          perfective (do it, once); “don’t” usually takes the imperfective.
        </p>
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>To</th>
              <th className={TH}>
                Imperfective: <Pl>{c.impf}</Pl>
              </th>
              <th className={TH}>
                Perfective: <Pl>{c.pf}</Pl>
              </th>
            </tr>
          </thead>
          <tbody>
            {c.imperative.map((row) => (
              <tr key={row.who}>
                <td className={`${TD} text-muted`}>
                  <Pl>{row.who}</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.impf}!</Pl>
                </td>
                <td className={`${TD} sentence text-base`}>
                  <Pl>{row.pf}!</Pl>
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <ExampleList examples={verbExamples("imperative", EXAMPLE_VERBS)} />
        <PractiseLink href={verbPracticeHref(["imperative"])}>Practise the imperative</PractiseLink>
      </Section>

      <Section id="reflexive" title="Reflexive verbs">
        <p>
          Some verbs carry a small extra word that stays with them in every tense, usually straight after
          the verb. Take <Pl className="font-medium">{reflexive.inf}</Pl> (to {reflexive.en}):{" "}
          {reflexive.forms.map((form, i) => (
            <span key={form}>
              {i > 0 ? ", " : ""}
              <Pl className="sentence">{form}</Pl>
            </span>
          ))}
          .
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <PractiseLink href={verbPracticeHref(["present", "past", "future", "futureCompound", "imperative"])}>
            Practise every tense
          </PractiseLink>
          <Link href="/verbs" className="text-accent underline underline-offset-4">
            Choose tenses and verb types
          </Link>
        </div>
      </Section>
    </GuideLayout>
  );
}

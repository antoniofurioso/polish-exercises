import Link from "next/link";
import type { ReactNode } from "react";
import { ExampleList, GuideLayout, Pl, PractiseLink, Section, TD, TH, TableBox } from "@/components/Guide";
import { CASE_INFO } from "@/lib/cases";
import {
  PL_COLUMNS,
  SG_COLUMNS,
  demonstrativeTable,
  possessiveExamples,
  possessiveOwners,
  possessivePracticeHref,
  possessiveTable,
  pronounExamples,
  pronounPracticeHref,
  type AgreementTable,
} from "@/lib/guides";
import { OWNER_INFO } from "@/lib/possessives";
import { DEMONSTRATIVES } from "@/lib/pronouns";
import { pageMetadata } from "@/lib/site";

const PATH = "/polish-pronouns";

export const metadata = pageMetadata({
  title: "Polish demonstrative and possessive pronouns",
  description:
    "Full tables of the Polish demonstratives (this, that) and possessives (my, your, our) in every gender and case, which possessives never change, and example sentences with English.",
  path: PATH,
});

function Paradigm({ table, caption }: { table: AgreementTable; caption: ReactNode }) {
  return (
    <TableBox caption={caption}>
      <thead>
        <tr>
          <th className={TH} rowSpan={2}>
            Case
          </th>
          <th className={`${TH} text-center`} colSpan={SG_COLUMNS.length}>
            Singular
          </th>
          <th className={`${TH} text-center`} colSpan={PL_COLUMNS.length}>
            Plural
          </th>
        </tr>
        <tr>
          {[...SG_COLUMNS, ...PL_COLUMNS].map((c, i) => (
            <th key={i} className={`${TH} text-xs font-normal`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.map((row) => (
          <tr key={row.kase}>
            <td className={`${TD} whitespace-nowrap text-muted`}>{CASE_INFO[row.kase].en}</td>
            {[...row.sg, ...row.pl].map((form, i) => (
              <td key={i} className={`${TD} sentence text-base`}>
                <Pl>{form}</Pl>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </TableBox>
  );
}

export default function PolishPronounsPage() {
  const owners = possessiveOwners();
  const fixed = owners.filter((o) => o.family === "fixed");
  const [ten, tamten] = DEMONSTRATIVES;
  return (
    <GuideLayout
      path={PATH}
      eyebrow="Grammar guide"
      title="Polish pronouns: this, that, my and our"
      intro={
        <>
          <p>
            Words like “this”, “that”, “my” and “our” behave like adjectives in Polish: they take the
            gender, number and case of the noun they go with. That makes them one of the best places to
            practise agreement, because the same few endings come back again and again.
          </p>
          <p>Every form below is produced by the grammar code the drills use.</p>
        </>
      }
    >
      <Section id="genders" title="Five genders in the singular, two in the plural">
        <p className="text-muted">
          In the singular the masculine splits into people, animals and things, which only differ in the
          accusative. In the plural there are just two groups: groups including men (masculine personal)
          and everything else.
        </p>
      </Section>

      <Section
        id="ten"
        title={
          <>
            This and that: <Pl>{ten}</Pl>, <Pl>{tamten}</Pl>
          </>
        }
      >
        <p>
          <Pl className="font-medium">{ten}</Pl> means “this” (or just “the one we mean”), and{" "}
          <Pl className="font-medium">{tamten}</Pl> means “that one over there”. The second is the first with a
          prefix, apart from the feminine accusative.
        </p>
        <Paradigm table={demonstrativeTable(ten)} caption={<><Pl>{ten}</Pl>: this / these</>} />
        <Paradigm table={demonstrativeTable(tamten)} caption={<><Pl>{tamten}</Pl>: that / those</>} />
        <ExampleList examples={pronounExamples()} />
        <div className="flex flex-wrap items-center gap-4">
          <PractiseLink href={pronounPracticeHref()}>Practise this and that</PractiseLink>
          <Link href="/pronouns" className="text-accent underline underline-offset-4">
            Choose cases and genders
          </Link>
        </div>
      </Section>

      <Section id="possessives" title="My, your, his, her, our, their">
        <TableBox>
          <thead>
            <tr>
              <th className={TH}>Possessive</th>
              <th className={TH}>English</th>
              <th className={TH}>Owner</th>
              <th className={TH}>Changes?</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.key}>
                <td className={`${TD} sentence text-base font-medium`}>
                  <Pl>{o.lemma}</Pl>
                </td>
                <td className={TD}>{o.en}</td>
                <td className={TD}>
                  {o.key === "swoj" ? o.who : <Pl>{o.who}</Pl>}
                </td>
                <td className={TD}>{o.family === "fixed" ? "Never" : "Agrees with the noun"}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <p>
          {fixed.map((o, i) => (
            <span key={o.key}>
              {i > 0 ? (i === fixed.length - 1 ? " and " : ", ") : ""}
              <Pl className="font-medium">{o.lemma}</Pl>
            </span>
          ))}{" "}
          never change: they belong to the owner, not to the thing owned. All the others agree with the
          noun, like adjectives. <Pl className="font-medium">{OWNER_INFO.swoj.lemma}</Pl> means “one’s own”
          and points back to the subject of the sentence, whoever that is.
        </p>
        <Paradigm table={possessiveTable("moj")} caption={
            <>
              <Pl>{OWNER_INFO.moj.lemma}</Pl>: my (the same endings for <Pl>{OWNER_INFO.twoj.lemma}</Pl> and{" "}
              <Pl>{OWNER_INFO.swoj.lemma}</Pl>)
            </>
          } />
        <Paradigm table={possessiveTable("nasz")} caption={
            <>
              <Pl>{OWNER_INFO.nasz.lemma}</Pl>: our (the same endings for <Pl>{OWNER_INFO.wasz.lemma}</Pl>)
            </>
          } />
        <ExampleList examples={possessiveExamples()} />
        <div className="flex flex-wrap items-center gap-4">
          <PractiseLink href={possessivePracticeHref()}>Practise the possessives</PractiseLink>
          <Link href="/possessives" className="text-accent underline underline-offset-4">
            Choose which possessives
          </Link>
        </div>
      </Section>
    </GuideLayout>
  );
}

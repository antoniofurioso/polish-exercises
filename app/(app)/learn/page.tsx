import { Dashboard } from "@/components/Dashboard";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Polish grammar drills",
  description:
    "Pick a Polish grammar drill: the seven cases, demonstrative and possessive pronouns, numbers and dates, verb tenses, or everything shuffled together.",
  path: "/learn",
});

/** The app's home: today's practice, the learner's numbers and every drill's configurator. */
export default function LearnPage() {
  return <Dashboard />;
}

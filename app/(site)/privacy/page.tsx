import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { ClearLocalData, ConsentChoice } from "@/components/Privacy";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${BRAND.name} handles your data: progress stays on your device, analytics only with your consent.`,
};

/** Shown on the page; update it with every change to this policy. */
const LAST_UPDATED = "10 October 2026";

/**
 * The privacy policy (plans/phase-3.md §5). Server-rendered text; the consent
 * toggle and the "clear my data" button are the only client parts.
 */
export default function Privacy() {
  const contact = BRAND.email ? (
    <a href={`mailto:${BRAND.email}`} className="text-accent underline underline-offset-4">
      {BRAND.email}
    </a>
  ) : (
    <span>contact address coming soon</span>
  );

  return (
    <main className="container-page max-w-3xl py-12 sm:py-20">
      <p className="eyebrow">{BRAND.name}</p>
      <h1 className="heading mt-3">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-1">
        <section>
          <h2>The short version</h2>
          <ul>
            <li>There are no accounts. Your progress and settings are stored only on your device and are never sent to us.</li>
            <li>Usage analytics run only if you click “Allow analytics”. Until then nothing is sent and no cookie is set.</li>
            <li>Analytics never include what you type, and are hosted in the EU.</li>
            <li>You can change your mind or wipe everything on this page at any time.</li>
          </ul>
        </section>

        <section>
          <h2>Who is responsible</h2>
          <p>
            {BRAND.name} is run by {BRAND.owner}, the data controller for this website. Contact:{" "}
            {contact}.
          </p>
        </section>

        <section>
          <h2>What stays on your device</h2>
          <p>
            The app keeps these in your browser’s local storage, under keys that start with{" "}
            <code>polish.</code>:
          </p>
          <ul>
            <li>your answer history (which card, right or wrong, the kind of mistake, the date and time) and the progress worked out from it: streak, daily goal, what is due for review;</li>
            <li>your settings: daily goal, new words per day, sound on or off, light or dark appearance, the last options you chose for each exercise;</li>
            <li>the name you give on your profile page, if you give one;</li>
            <li>your analytics choice, and the day the “goal met” event was last sent.</li>
          </ul>
          <p>
            None of this is transmitted to us or anyone else. It is not a cookie and it stays until
            you clear it. Your typed answers are graded in your browser and are not stored or sent
            anywhere.
          </p>
          <div className="mt-5">
            <ClearLocalData />
          </div>
        </section>

        <section>
          <h2>Analytics, only with your consent</h2>
          <p>
            If you allow it, we use PostHog to learn how the app is used, for example how many people
            come back a week later. The data goes to PostHog’s EU cloud (servers in Frankfurt,
            Germany). PostHog acts as our processor under a data processing agreement.
          </p>
          <p>When analytics are on, PostHog receives:</p>
          <ul>
            <li>page views: the page address (for a practice session that includes its settings, such as the exercise type), the referring page, browser, operating system, device type and screen size;</li>
            <li>“session started” and “session finished”: where the session came from (today’s practice or a chosen exercise), which exercise, how many questions, how many were right;</li>
            <li>“answer”: which exercise, and whether the answer was right, nearly right (missing accents) or wrong. Never the answer itself;</li>
            <li>“goal met”: your daily goal and streak length, at most once a day;</li>
            <li>“app installed”: when you add the app to your home screen;</li>
            <li>a random ID created in your browser so visits can be counted as the same visitor, kept in a first-party cookie and in local storage (names starting with <code>ph_</code>);</li>
            <li>your IP address, which PostHog uses to work out an approximate location (country and city) and which we have set PostHog to discard.</li>
          </ul>
          <p>
            We do not use autocapture, session recordings, surveys or advertising, and we do not
            link this data to your name or e-mail (we never ask for them). Events are kept for 12
            months, a retention period set in our PostHog project, and then deleted.
          </p>
          <div className="card mt-5 p-5">
            <ConsentChoice />
          </div>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>
            No cookies are set before you allow analytics. With analytics on, PostHog sets one
            first-party cookie holding the random ID above (it expires after a year). Choosing
            “No thanks” later deletes it.
          </p>
        </section>

        <section>
          <h2>Sentence audio</h2>
          <p>
            When you play a sentence, its text (the Polish exercise sentence the app made, never
            your answer) and the voice name are sent to our audio service, a Cloudflare Worker,
            which returns a recording. Like any web request, Cloudflare sees your IP address and
            browser; the Worker does not log them, and uses the IP address only to limit how many
            new recordings one visitor can request per minute. If a sentence has not been recorded
            yet, the Worker may send its text (and nothing about you) to Microsoft Azure’s speech
            service to create one.
          </p>
          <p>
            If the audio service is unavailable, your browser’s own speech engine reads the
            sentence instead. Some browsers process that text on their maker’s servers; that is
            covered by your browser’s privacy policy.
          </p>
        </section>

        <section>
          <h2>Hosting</h2>
          <p>
            The site is served by Cloudflare Pages. Cloudflare processes your IP address and
            browser details to deliver the pages and protect the site from attacks, as any web host
            does.
          </p>
        </section>

        <section>
          <h2>Legal basis</h2>
          <p>
            Analytics: your consent (Article 6(1)(a) GDPR), which you can withdraw at any time
            without affecting anything you did before. Serving the site and the audio: our
            legitimate interest in running a working, secure website (Article 6(1)(f)). The data on
            your device is under your control and is not processed by us.
          </p>
        </section>

        <section>
          <h2>Transfers outside the EU</h2>
          <p>
            Analytics data is stored in the EU. PostHog, Cloudflare and Microsoft are companies with
            operations in the United States; where data may be accessed from outside the EU, they
            rely on the EU Standard Contractual Clauses or the EU–US Data Privacy Framework.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>Under the GDPR you have the right to:</p>
          <ul>
            <li>access the personal data we hold about you, and get a copy;</li>
            <li>have it corrected or erased;</li>
            <li>restrict or object to its processing;</li>
            <li>withdraw your consent at any time, with the buttons above;</li>
            <li>complain to the data protection authority where you live or work.</li>
          </ul>
          <p>
            Write to {contact} to use these rights. Analytics data is tied only to a random ID, so
            we may need that ID from you to find it; withdrawing consent deletes it from your
            device and stops all further collection.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            If this policy changes, the new version is published here with a new date. If the
            change affects what analytics collect, we will ask for your consent again.
          </p>
        </section>
      </div>
    </main>
  );
}

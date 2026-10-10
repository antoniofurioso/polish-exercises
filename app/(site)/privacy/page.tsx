import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { ClearLocalData, ConsentChoice } from "@/components/Privacy";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${BRAND.name} handles your data: your account and synced progress, payments through Stripe, email only as you choose, analytics only with your consent.`,
};

/** Shown on the page; update it with every change to this policy. */
const LAST_UPDATED = "10 October 2026";

/**
 * The privacy policy (plans/phase-3.md §5, rewritten for accounts in
 * plans/phase-4.md §15). Server-rendered text; the consent toggle and the
 * "clear my data" button are the only client parts. Keep it true to
 * lib/analytics.ts, lib/storage.ts and workers/api.
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
            <li>To practise you sign in with your email address and a one-time code. The landing page, the grammar guides and this page work without an account.</li>
            <li>Your account keeps your email, your answer history, your daily goal settings and the name you give, so you find the same progress on every device. What you type as an answer is never stored or sent.</li>
            <li>Payments are handled by Stripe, which sells the subscription to you as merchant of record. We never see your card.</li>
            <li>We email you sign-in codes and, during a free trial, one reminder. Tips and news only if you tick the box for them, and you can stop them at any time.</li>
            <li>Usage analytics run only if you click “Allow analytics”, are hosted in the EU and are never linked to your email or your account.</li>
            <li>You can download everything your account holds, or delete the account, from Settings at any time.</li>
          </ul>
        </section>

        <section>
          <h2>Who is responsible</h2>
          <p>
            {BRAND.name} is run by {BRAND.owner}, the data controller for this website and the app.
            Contact: {contact}.
          </p>
        </section>

        <section>
          <h2>Your account</h2>
          <p>
            You sign in by typing a 6-digit code that we email to you. There is no password. Our
            server (a Cloudflare Worker with a Cloudflare D1 database) keeps:
          </p>
          <ul>
            <li>your email address and the date the account was made;</li>
            <li>your answer history: for each answer, when it was given, which card and skill it practised (for example “genitive plural” or “past tense, 3rd person”), the exercise type, whether it was right, nearly right (missing accents) or wrong, and the kind of mistake. From it the app works out your streak, what is due for review and your weak spots. If you practised with an earlier version of the app, a summary of that older progress is kept as well;</li>
            <li>your settings that affect your progress: daily goal and new words per day;</li>
            <li>the name you give on your profile page, if you give one;</li>
            <li>your plan: which one, its status, when access or a trial ends, the currency, whether you have used a trial, and Stripe’s reference numbers for your customer record, subscription or payment;</li>
            <li>your email choice: whether you agreed to tips and news, when, and where (at sign-in, in Settings or through an unsubscribe link);</li>
            <li>for each device you are signed in on, a sign-in session: a scrambled (hashed) copy of its key, when it was made and when it was last used;</li>
            <li>while you sign in, a scrambled copy of the code and how many codes were sent to your address, to limit abuse.</li>
          </ul>
          <p>
            Your typed answers, sound, appearance, the options you chose for each exercise, today’s
            unfinished session and your analytics choice are not sent: they stay on the device.
          </p>
          <p>
            Like any web request, a call to our server shows Cloudflare your IP address and browser.
            We use the IP address only to limit how many sign-in attempts one visitor can make per
            minute, and the country Cloudflare derives from it only to suggest a currency for
            prices. We store neither.
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
            <li>while you are signed in: the key of your sign-in session, your email and plan, the answers not yet uploaded to your account, and how far this device has synced;</li>
            <li>whether sign-up is open for free and until when a plan is on offer, as our server last said, with the currency it suggested;</li>
            <li>your analytics choice, and the day the “goal met” event was last sent.</li>
          </ul>
          <p>
            While you go through checkout, this browser tab also remembers the plan and currency you
            chose (in session storage, gone when the tab closes), so the app can tell when the
            purchase is done.
          </p>
          <p>
            None of this is a cookie. Signed out, it is never sent anywhere; signed in, the answer
            history, the two progress settings and your name are synced with your account as
            described above. Your typed answers are graded in your browser and are not stored or
            sent anywhere. Signing out leaves your progress on the device. The button below deletes
            everything on this device and signs you out; your account is deleted separately, in
            Settings.
          </p>
          <div className="mt-5">
            <ClearLocalData />
          </div>
        </section>

        <section>
          <h2>Payments</h2>
          <p>
            Plans are sold through Stripe Managed Payments. Stripe is the merchant of record: it
            sells you the subscription or the one-time purchase, charges VAT or sales tax, and sends
            the receipts and invoices. Stripe collects your card or other payment details, billing
            address and email on its own checkout page and handles them under its own privacy
            policy. We never see your card details.
          </p>
          <p>
            When you first open checkout we create a customer record at Stripe with your email and
            your account’s ID. Stripe then tells us what we need to give you access: the plan, its
            status, the trial and billing dates, the currency, and whether a payment was refunded or
            disputed. “Manage billing” opens Stripe’s customer portal, where you can change or
            cancel your plan and download invoices.
          </p>
        </section>

        <section>
          <h2>Email</h2>
          <p>
            Emails are sent through Resend, our email provider, which acts as our processor. We
            send:
          </p>
          <ul>
            <li>sign-in codes, when you ask for one;</li>
            <li>during a free trial, one reminder about a day and a half before it ends, saying when the trial ends and what the plan will cost;</li>
            <li>tips and news about {BRAND.name}, <strong>only if you agreed</strong>: an unticked box at sign-in, or the “Email tips” switch in Settings.</li>
          </ul>
          <p>
            Stripe sends its own receipts and invoices. Sign-in codes, the trial reminder and
            billing emails are part of the service and arrive whatever you chose.
          </p>
          <p>
            To manage the mailing, every account is a contact in Resend with its email address,
            account ID, current plan (beta, trial, monthly, annual, lifetime, or a past plan) and a
            personal unsubscribe link. A contact that has not agreed to tips and news is marked
            “unsubscribed”, so no marketing email reaches it. You can withdraw your agreement at
            any time with the unsubscribe link in every such email or the switch in Settings; it
            takes effect at once on our server. Deleting your account removes the contact.
          </p>
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
            <li>“sign-in started”, and “signed in” with whether the account was new or already existed;</li>
            <li>“plans shown”: that the plan page was shown, and whether you came from today’s practice or a chosen exercise;</li>
            <li>“checkout started” and “checkout completed”: the plan and the currency;</li>
            <li>“account deleted”: that an account was deleted, nothing else;</li>
            <li>a random ID created in your browser so visits can be counted as the same visitor, kept in a first-party cookie and in local storage (names starting with <code>ph_</code>);</li>
            <li>your IP address, which PostHog uses to work out an approximate location (country and city) and which we have set PostHog to discard.</li>
          </ul>
          <p>
            We never send PostHog your email address, your account ID or your email choice, and we
            never link analytics to your account. We do not use autocapture, session recordings,
            surveys or advertising. Events are kept for 12 months, a retention period set in our
            PostHog project, and then deleted.
          </p>
          <div className="card mt-5 p-5">
            <ConsentChoice />
          </div>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>
            No cookies are set before you allow analytics. Signing in does not use a cookie: the
            session key stays in local storage and is sent only to our server. With analytics on,
            PostHog sets one first-party cookie holding the random ID above (it expires after a
            year). Choosing “No thanks” later deletes it. Stripe’s checkout and billing pages are on
            Stripe’s own site and set Stripe’s cookies there.
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
            The site is served by Cloudflare Pages, and the account server runs on Cloudflare
            Workers with its data in Cloudflare D1. Cloudflare processes your IP address and
            browser details to deliver the pages and protect the site from attacks, as any web host
            does, and acts as our processor for the account data.
          </p>
        </section>

        <section>
          <h2>Legal basis</h2>
          <ul>
            <li>Your account, syncing your progress, sign-in codes, the trial reminder and giving you the access you paid for: performing our contract with you (Article 6(1)(b) GDPR).</li>
            <li>Tips and news by email, and analytics: your consent (Article 6(1)(a)), which you can withdraw at any time without affecting anything done before.</li>
            <li>Payment, tax and invoice records, which Stripe as merchant of record keeps as tax law requires: a legal obligation (Article 6(1)(c)).</li>
            <li>Serving the site and the audio, limiting sign-in attempts, remembering (as a hash) which email addresses already had a free trial, and keeping accounts that have not agreed to marketing on the mailing list marked as unsubscribed: our legitimate interest in running a working, secure service, in preventing repeated free trials, and in making sure marketing reaches only those who asked for it (Article 6(1)(f)).</li>
          </ul>
          <p>The data on your device is under your control.</p>
        </section>

        <section>
          <h2>How long we keep it</h2>
          <ul>
            <li>Your account, answer history, settings, name, plan and email choice: until you delete the account.</li>
            <li>A sign-in session: until you sign out on that device, or 180 days after it was last used.</li>
            <li>A sign-in code: it works once and expires after 10 minutes. The address and the count of codes sent to it, kept to limit abuse, are deleted the day after (our clean-up runs daily at 03:30 UTC). Expired sessions are deleted by the same clean-up.</li>
            <li>The Resend contact: until you delete the account.</li>
            <li>If you had a free trial: a scrambled (hashed) form of your email address, kept also after the account is deleted, so that the free trial is given once per address.</li>
            <li>Payment and invoice records at Stripe: as long as tax and accounting law requires, also after the account is deleted.</li>
            <li>Analytics: 12 months.</li>
          </ul>
        </section>

        <section>
          <h2>Download or delete your account</h2>
          <p>
            In Settings, “Export your data” downloads everything your account holds (email, plan,
            settings, name and every answer) as a JSON file.
          </p>
          <p>
            “Delete account”, also in Settings, after you type your email to confirm: a running
            subscription is cancelled at once, with no refund for the rest of the period; your
            customer record at Stripe is deleted (Stripe keeps the payment records the law
            requires); your Resend contact is removed; and your email, answers, settings, name,
            plan and sessions are deleted from our server, except the hashed address of a past free trial (see above). Lifetime and beta access end with the
            account. The app then offers to delete the data on your device too.
          </p>
        </section>

        <section>
          <h2>Transfers outside the EU</h2>
          <p>
            Analytics data is stored in the EU. Cloudflare, Stripe, Resend, PostHog and Microsoft
            are companies with operations in the United States, and Resend stores contacts and
            emails there; where data is transferred or may be accessed from outside the EU, they
            rely on the EU Standard Contractual Clauses or the EU–US Data Privacy Framework.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>Under the GDPR you have the right to:</p>
          <ul>
            <li>access the personal data we hold about you, and get a copy (the export in Settings gives it to you at once);</li>
            <li>have it corrected or erased (deleting the account in Settings erases it);</li>
            <li>restrict or object to its processing;</li>
            <li>withdraw your consent at any time, with the buttons above, the switch in Settings or the unsubscribe link;</li>
            <li>complain to the data protection authority where you live or work (in Poland, the President of the Personal Data Protection Office, UODO).</li>
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

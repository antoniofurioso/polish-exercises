import type { Metadata } from "next";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { NOINDEX, pageMetadata } from "@/lib/site";
import { SignInPage } from "./SignInClient";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Sign in",
    description: `Sign in to ${BRAND.name} with a code sent to your email, and keep your progress on every device.`,
    path: "/signin",
  }),
  robots: NOINDEX,
};

export default function SignIn() {
  return (
    <Suspense>
      <SignInPage />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { InvitationScreen } from "@/screens/invitation";

export const metadata: Metadata = { title: "Invitation" };

// The screen reads the URL in the browser, so it sits behind Suspense.
export default function Page() {
  return (
    <Suspense
      fallback={
        <section className="band">
          <div className="wrap">
            <Loading />
          </div>
        </section>
      }
    >
      <InvitationScreen />
    </Suspense>
  );
}

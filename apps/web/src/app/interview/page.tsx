import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { InterviewScreen } from "@/screens/interview";

export const metadata: Metadata = { title: "Interview" };

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
      <InterviewScreen />
    </Suspense>
  );
}

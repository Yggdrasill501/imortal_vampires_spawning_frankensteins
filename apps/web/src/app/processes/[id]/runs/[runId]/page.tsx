import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { RunScreen } from "@/screens/run";

export const metadata: Metadata = { title: "Run" };

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
      <RunScreen />
    </Suspense>
  );
}

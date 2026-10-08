import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { Reliquary } from "@/screens/reliquary";

export const metadata: Metadata = { title: "Reliquary" };

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
      <Reliquary />
    </Suspense>
  );
}

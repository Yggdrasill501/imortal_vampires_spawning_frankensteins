import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { Interviews } from "@/screens/interviews";

export const metadata: Metadata = { title: "Interviews" };

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
      <Interviews />
    </Suspense>
  );
}

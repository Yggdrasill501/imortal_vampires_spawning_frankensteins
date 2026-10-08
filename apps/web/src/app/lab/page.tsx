import type { Metadata } from "next";
import { Lab } from "@/screens/lab";

export const metadata: Metadata = { title: "The Lab" };

export default function Page() {
  return <Lab />;
}

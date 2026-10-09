import type { Metadata } from "next";
import { Lab } from "@/screens/lab";

export const metadata: Metadata = { title: "The Forge" };

export default function Page() {
  return <Lab />;
}

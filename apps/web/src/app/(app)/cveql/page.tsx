import { redirect } from "next/navigation";

/** Legacy route — CVEQL is the Search page. */
export default function CveqlRedirectPage() {
  redirect("/search");
}

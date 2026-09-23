import { redirect } from "next/navigation";

/** Root: no marketing landing — send to console login. */
export default function Home() {
  redirect("/login");
}

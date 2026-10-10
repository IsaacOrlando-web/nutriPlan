import { redirect } from "next/navigation";

/** Trends became Progress; old links keep working. */
export default function TrendsRedirect() {
  redirect("/progress");
}

import { redirect } from "next/navigation";

/** The dashboard lives at "/"; keep "/dashboard" working for links and tests. */
export default function DashboardAlias() {
  redirect("/");
}

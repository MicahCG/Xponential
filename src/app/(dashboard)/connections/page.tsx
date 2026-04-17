import { redirect } from "next/navigation";

// Connections page has been merged into Settings.
// Redirect any old links.
export default function ConnectionsPage() {
  redirect("/settings");
}

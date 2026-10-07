import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/tracker" });
  },
  head: () => ({
    meta: [
      { title: "Trackify — Time tracking for small teams" },
      {
        name: "description",
        content:
          "Trackify is a minimal time tracker for freelancers and small teams: live timer, time entries, reports and client billing.",
      },
      { property: "og:title", content: "Trackify — Time tracking for small teams" },
      {
        property: "og:description",
        content: "Track hours, manage projects and bill clients with a calm, focused workspace.",
      },
    ],
  }),
  component: () => null,
});

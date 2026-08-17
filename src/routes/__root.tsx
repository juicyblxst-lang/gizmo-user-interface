import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@tanstack/react-router";
import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GIZMO — Quantitative Lead-Lag Intelligence" },
      { name: "description", content: "GIZMO quantitative lead-lag research intelligence terminal." },
      { name: "application-name", content: "GIZMO" },
      { name: "apple-mobile-web-app-title", content: "GIZMO" },
      { name: "theme-color", content: "#0b0f10" },
    ],
  }),
  links: [
    { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
  ],
  component: RootComponent,
  notFoundComponent: () => (
    <div style={{ padding: 20, color: "white", background: "#111" }}>
      404 - Page Not Found
    </div>
  ),
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

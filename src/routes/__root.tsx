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
      { title: "GIZMO - Trading Intelligence" },
      {
        name: "description",
        content: "GIZMO trading intelligence terminal.",
      },
    ],
  }),
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

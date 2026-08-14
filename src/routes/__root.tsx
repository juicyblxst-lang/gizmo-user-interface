import React from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import "../styles.css";

export const Route = createRootRoute({
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
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/src/styles.css" />
        <title>GIZMO - Trading Intelligence</title>
      </head>
      <body>
        <div id="root">
          <Outlet />
        </div>
      </body>
    </html>
  );
}

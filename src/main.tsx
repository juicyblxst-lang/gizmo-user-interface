import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Workspace } from "./components/gizmo/workspace";
import "./styles.css";

function currentThreadId() {
  const match = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "default";
}

function App() {
  const [threadId, setThreadId] = useState(currentThreadId);

  useEffect(() => {
    const handlePopState = () => setThreadId(currentThreadId());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return <Workspace threadId={threadId} />;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("GIZMO root element was not found.");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

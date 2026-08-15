import React, { createContext, useCallback, useContext, useState } from "react";
import type { ChatStatus } from "ai";

export type PromptInputMessage = { text?: string };

type PromptInputContextValue = {
  value: string;
  setValue: (value: string) => void;
  submit: () => void;
};

const PromptInputCtx = createContext<PromptInputContextValue | null>(null);

export function PromptInput({ children, onSubmit, className, ...props }: {
  children?: React.ReactNode;
  onSubmit: (message: PromptInputMessage) => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const submit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    onSubmit({ text });
    setValue("");
  }, [onSubmit, value]);

  return (
    <PromptInputCtx.Provider value={{ value, setValue, submit }}>
      <form onSubmit={(event) => { event.preventDefault(); submit(); }} className={className} {...props}>
        {children}
      </form>
    </PromptInputCtx.Provider>
  );
}

export const PromptInputTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function PromptInputTextarea(props, ref) {
  const ctx = useContext(PromptInputCtx);
  return <textarea {...props} ref={ref} value={ctx?.value ?? ""} onChange={(event) => ctx?.setValue(event.target.value)} />;
});

export function PromptInputFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props}>{children}</div>;
}

export function PromptInputSubmit({ status, onClick, className, ...props }: { status?: ChatStatus; onClick?: () => void; className?: string; [key: string]: unknown }) {
  const ctx = useContext(PromptInputCtx);
  const busy = status === "submitted" || status === "streaming";
  return (
    <button
      type={busy ? "button" : "submit"}
      className={className}
      onClick={busy ? onClick : undefined}
      {...props}
    >
      {busy ? "Stop" : "Send"}
    </button>
  );
}

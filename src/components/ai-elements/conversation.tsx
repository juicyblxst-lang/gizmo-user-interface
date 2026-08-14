"use client";
import React from "react";
import { cn } from "@/lib/utils";
export function Conversation({ children, className }: any) {
  return <div className={cn("flex flex-col gap-4 p-4", className)}>{children}</div>;
}
export function ConversationContent({ children, className }: any) {
  return <div className={cn("flex-1 overflow-y-auto", className)}>{children}</div>;
}
export function ConversationScrollButton() { return null; }

"use client";
import React from "react";
import { cn } from "@/lib/utils";
export function Message({ children, className }: any) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}
export function MessageContent({ children, className }: any) {
  return <div className={cn("prose prose-sm max-w-none", className)}>{children}</div>;
}
export function MessageResponse({ children, className }: any) {
  return <div className={cn("text-sm text-muted-foreground", className)}>{children}</div>;
}

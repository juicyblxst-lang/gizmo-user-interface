"use client";
import React from "react";
import { cn } from "@/lib/utils";
export function Shimmer({ className }: any) {
  return <div className={cn("animate-pulse bg-muted rounded", className)}>&nbsp;</div>;
}

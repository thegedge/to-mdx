import clsx, { type ClassValue } from "clsx";
import { Style } from "./styles.ts";

export type Maybe<T> = T | null | undefined;

export const escapeForMdx = (text: string): string => {
  return text.replaceAll(/{/g, "\\{").replaceAll(/</g, "\\<");
};

export const compact = <T>(object: Record<string, Maybe<T>>): Record<string, T> => {
  return Object.fromEntries(Object.entries(object).filter((v): v is [string, T] => v[1] != null));
};

export const cls = (...classes: ClassValue[]): string => {
  return clsx(classes.map((c) => (c instanceof Style ? c.toString() : c)));
};

export const convertCmToPercent = (value: Maybe<string>, pageDimension?: number): string | null => {
  if (!value || !pageDimension) {
    return null;
  }

  const match = /^(-?[\d.]+)cm$/.exec(value);
  if (!match) {
    throw new Error(`Invalid unit format: expected 'cm' but got '${value}'`);
  }

  const cmValue = parseFloat(match[1]);
  const percent = Math.round((cmValue / pageDimension) * 100);
  if (percent.toFixed(1) == "0.0") {
    return "0.1%";
  }
  return `${percent.toFixed(1)}%`;
};

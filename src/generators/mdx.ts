import * as yaml from "yaml";

export interface FrontmatterData {
  title: string;
  subtitle: string;
  description: string;
  company: {
    name: string;
    position: string;
  };
  event: {
    name: string;
    url: string;
  };
  keywords: string[];
  [key: string]: unknown;
}

export function generateFrontmatter(metadata: Record<string, unknown>): string {
  const frontmatter: FrontmatterData = {
    title: "",
    subtitle: "",
    description: "",
    company: {
      name: "",
      position: "",
    },
    event: {
      name: "",
      url: "",
    },
    keywords: [],
  };

  Object.entries(metadata).forEach(([name, value]) => {
    if (name === "date") return; // Skip date in frontmatter
    if (name === "metadata") return;

    if (typeof value === "string" && value.includes("\\n")) {
      frontmatter[name] = value
        .split("\\n")
        .map((line) => line.trimEnd())
        .join("\n");
    } else {
      frontmatter[name] = value;
    }
  });

  return `---\n${yaml.stringify(frontmatter, { blockQuote: "folded", lineWidth: 100 })}---`;
}

export function generateSlideContent(slideContent: string): string {
  // The slide content is already formatted as MDX by the parsers
  return slideContent;
}

export function formatAttributes(attributes: Record<string, unknown> | null): string {
  if (!attributes || Object.keys(attributes).length === 0) {
    return "";
  }

  const formattedAttrs: string[] = [];

  Object.entries(attributes).forEach(([key, value]) => {
    if (typeof value === "string") {
      formattedAttrs.push(`${key}="${value}"`);
    } else if (Array.isArray(value)) {
      formattedAttrs.push(`${key}={[${value.join(", ")}]}`);
    }
  });

  return ` ${formattedAttrs.join(" ")}`;
}

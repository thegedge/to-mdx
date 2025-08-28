import dedent from "dedent-js";
import { memoize } from "lodash-es";
import type { Maybe } from "./utils.ts";

export type StyleProperties = Record<string, string | undefined>;
export type OptimizedStyles = Record<string, string[] | undefined>;

export class Styles {
  private styles: Record<string, StyleProperties | undefined> = {};
  private usedStyles = new Map<Maybe<string>, Style>();
  private propertyMappingCache: Record<string, string> = {};

  #generatedClasses = 0;

  constructor(styles: Record<string, StyleProperties> = {}) {
    this.styles = styles;
  }

  merge(other: Record<string, StyleProperties>): void {
    this.styles = { ...this.styles, ...other };
  }

  properties(key: string | Style): StyleProperties {
    const styleKey = key instanceof Style ? key.key : key;
    return (styleKey && this.styles[styleKey]) || {};
  }

  use(key: Maybe<string>): Style {
    let style = this.usedStyles.get(key);
    if (!style) {
      style = new Style(key, this);
      this.usedStyles.set(key, style);
    }

    return style;
  }

  get(key: string): StyleProperties {
    return this.styles[key] ?? {};
  }

  addStyle(styleName: string, properties: StyleProperties): void {
    this.styles[styleName] = properties;
  }

  getStyleCount(): number {
    return Object.keys(this.styles).length;
  }

  toMdx(): string {
    const optimized = this.getOptimizedStyles();
    if (Object.keys(optimized).length === 0) {
      return "";
    }

    const classes = Object.entries(this.getPropertyMapping()).map(
      ([property, className]) => `.${className} { ${property} }`,
    );

    return dedent`
      <style>{\`
        ${classes.join("\n  ")}
      \`}</style>
    `;
  }

  propertyForOptimizedStyle(className: string): string {
    const [property, _] =
      Object.entries(this.propertyMappingCache).find(([_property, classNames]) => classNames.includes(className)) ?? [];
    return property ?? "";
  }

  getOptimizedStyles = memoize((): OptimizedStyles => {
    const optimizedStyles: OptimizedStyles = {};

    for (const key of this.usedStyles.keys()) {
      if (!key) {
        continue;
      }

      optimizedStyles[key] = [];

      const styles = this.styles[key];
      if (!styles || Object.keys(styles).length === 0) {
        continue;
      }

      // Generate a utility class for each property
      Object.entries(styles).forEach(([propertyName, propertyValue]) => {
        if (!propertyValue) {
          return;
        }

        const property = `${propertyName}: ${propertyValue};`;
        let className = this.propertyMappingCache[property];
        switch (property.toLowerCase()) {
          case "align-items: center;":
            className = "items-center";
            break;
          case "align-items: start;":
            className = "items-start";
            break;
          case "align-items: end;":
            className = "items-end";
            break;
          case "background-color: #ffffff;":
            className = "bg-white";
            break;
          case "background-color: #000000;":
            className = "bg-black";
            break;
          case "background-color: transparent;":
            className = "bg-transparent";
            break;
          case "color: #000000;":
            className = "text-black";
            break;
          case "color: #ffffff;":
            className = "text-white";
            break;
          case "display: flex;":
            className = "flex";
            break;
          case "fill: none;":
            className = "fill-none";
            break;
          case "flex-direction: column;":
            className = "flex-col";
            break;
          case "font-family: 'Courier New', Courier, monospace;":
            className = "font-mono";
            break;
          case "font-style: italic;":
            className = "italic";
            break;
          case "font-weight: bold;":
            className = "font-bold";
            break;
          case "justify-content: start;":
            className = "justify-start";
            break;
          case "justify-content: end;":
            className = "justify-end";
            break;
          case "justify-content: center;":
            className = "justify-center";
            break;
          case "text-align: center;":
            className = "text-center";
            break;
          case "text-align: end;":
            className = "text-end";
            break;
          default:
            className = this.propertyMappingCache[property];
            if (!className) {
              className = `c${++this.#generatedClasses}`;
              this.propertyMappingCache[property] = className;
            }
            break;
        }

        optimizedStyles[key]?.push(className);
      });
    }

    return optimizedStyles;
  });

  private getPropertyMapping(): Record<string, string> {
    return this.propertyMappingCache;
  }
}

export class Style {
  readonly key: string | null | undefined;

  #styles: Styles;
  #withoutProperties: string[] = [];

  constructor(key: string | null | undefined, styles: Styles, withoutProperties: string[] = []) {
    this.key = key;
    this.#styles = styles;
    this.#withoutProperties = withoutProperties;
  }

  empty(): boolean {
    if (!this.key) {
      return true;
    }

    const optimizedStyles = this.#styles.getOptimizedStyles();
    const style = optimizedStyles[this.key];
    return style ? style.length === 0 : true;
  }

  without(...property: string[]): Style {
    return new Style(this.key, this.#styles, [...this.#withoutProperties, ...property]);
  }

  toString(): string {
    if (!this.key) {
      return "";
    }

    const optimizedStyles = this.#styles.getOptimizedStyles();
    const value = optimizedStyles[this.key];
    if (!value) {
      return "";
    }

    return value
      .filter((className) => {
        const property = this.#styles.propertyForOptimizedStyle(className);
        const [name, _value] = property.split(":");
        return !this.#withoutProperties.includes(name);
      })
      .join(" ");
  }
}

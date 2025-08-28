import { memoize } from "lodash-es";
import type { BaseElement, ParsedElement } from "../../base_element.ts";
import { Equation } from "../draw/equation.ts";

// Parses the `draw:enhanced-path` attribute in an OpenDocument presentation
// The language, as defined in https://docs.oasis-open.org/office/OpenDocument/v1.4/OpenDocument-v1.4-part3-schema.html#attribute-draw_enhanced-path,
// with some editorialization for the purposes of easier reading:
//
//   formula ::=
//     additive_expression
//
//   additive_expression ::=
//     multiplicative_expression
//     ( ( S* '+' S* multiplicative_expression )
//     | ( S* '-' S* multiplicative_expression ) )*
//
//   multiplicative_expression ::=
//     unary_expression  ( ( S* '*' S* unary_expression )
//     | ( S* '/' S* unary_expression ) )*
//
//   unary_expression ::=
//     '-' S* basic_expression
//     | basic_expression
//
//   basic_expression ::=
//     number
//     | identifier
//     | function_reference
//     | modifier_reference
//     | unary_function S* '(' S* additive_expression S* ')'
//     | binary_function S* '(' S* additive_expression S* ',' S* additive_expression S* ')'
//     | ternary_function S* '(' S* additive_expression S* ',' S* additive_expression S* ',' S* additive_expression S* ')'
//     | '(' S* additive_expression S* ')'
//
//   identifier ::= 'pi' | 'left' | 'top' | 'right' | 'bottom' | 'xstretch'
//    | 'ystretch' | 'hasstroke' | 'hasfill' | 'width' | 'height' | 'logwidth'
//    | 'logheight'
//   unary_function ::= 'abs' | 'sqrt' | 'sin' | 'cos' | 'tan' | 'atan'
//   binary_function ::= 'min' | 'max' | 'atan2'
//   ternary_function ::= 'if'
//   number ::= sign? integer | sign? floating-point
//   function_reference ::= "?" name
//   modifier_reference ::= "$" integer
//   floating-point ::= fractional exponent? | integer exponent
//   fractional ::= integer? '.' integer | integer '.'
//   exponent ::= ( 'e' | 'E' ) sign? integer
//   sign ::= '+' | '-'
//   name ::= [^#x20#x9]+
//   integer ::= [0-9]+
//   S ::= (#x20 | #x9)

const OPEN_DOCUMENT_PATH_COMMANDS = [
  "A",
  "B",
  "C",
  "F",
  "G",
  "L",
  "M",
  "N",
  "Q",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

type TokenType =
  | "number"
  | "identifier"
  | "formula_reference"
  | "modifier_reference"
  | "binary_op"
  | "open_paren"
  | "close_paren"
  | "comma";
type Token = [TokenType] | [TokenType, string | number];

export class FormulaEvaluator {
  private element: BaseElement;
  private formulaCache: Record<string, number> = {};

  constructor(element: BaseElement) {
    this.element = element;
  }

  // Simplified SVG path generation
  svgPath(): string | null {
    this.getFormulas();

    const enhancedPath = this.element.attr("draw:enhanced-path");
    if (!enhancedPath) {
      return null;
    }

    const enhancedPathParts = enhancedPath.split(/[,\s]+/);
    const path: string[] = [];
    let numParams = 0;
    let iterations = 0;
    const maxIterations = 1000; // Prevent infinite loops

    while (enhancedPathParts.length > 0 && iterations < maxIterations) {
      iterations++;

      // TODO I think there are some commands in ODP that aren't in SVG. Double check.

      // Peek at the token.
      // If it's a command we'll maintain the number of params, so that we can handle many instances of those params.
      // Otherwise we reset everything for the new command.
      const token = enhancedPathParts[0];
      if (OPEN_DOCUMENT_PATH_COMMANDS.includes(token)) {
        enhancedPathParts.shift();
        numParams = this.getNumParamsForCommand(token);
        switch (token) {
          case "M":
            path.push(token);
            break;
          case "F": // nofill
          case "S": // nostroke
          case "N": // endpath, but don't draw a line back to the start (technically, we should start a new path)
            break;
          case "Z":
            path.push("z");
            break;
          default:
            path.push(token);
            break;
        }
      }

      for (let i = 0; i < numParams; i++) {
        const param = enhancedPathParts.shift();
        if (!param) {
          break;
        }

        // Assume value is 1/100th of a mm and convert back to cm
        const parsedParam = this.evaluate(param);
        path.push((parsedParam / 1000).toFixed(2));
      }
    }

    if (iterations >= maxIterations) {
      console.warn("Max iterations reached in svgPath generation");
    }

    // Seems like this is a common pattern when exported from Google Slides. Redundant, so pop.
    if (path.length > 2 && path[path.length - 1] === "N" && path[path.length - 2] === "Z") {
      path.pop();
    }

    return path.join(" ");
  }

  evaluate(expression: string): number {
    if (expression.startsWith("?")) {
      const formulaName = expression.slice(1);
      if (formulaName in this.formulaCache) {
        return this.formulaCache[formulaName];
      }

      const formulas = this.getFormulas();
      const formula = formulas[formulaName];
      const result = this.evaluateFormula(formula);
      this.formulaCache[formulaName] = result;
      return result;
    } else if (expression.startsWith("$")) {
      const index = parseInt(expression.slice(1), 10);
      const modifiers = this.getDrawModifiers();
      return modifiers[index];
    } else {
      return parseFloat(expression);
    }
  }

  private evaluateFormula(formula: string): number {
    this.getFormulas();

    const tokens = this.tokenize(formula);
    const [result, _] = this.parseAdditiveExpression(tokens, 0);
    return result;
  }

  private tokenize(formula: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < formula.length) {
      const char = formula[i];
      if (/\s/.test(char)) {
        i++;
      } else if (/[+\-*/]/.test(char)) {
        tokens.push(["binary_op", char]);
        i++;
      } else if (char === "(") {
        tokens.push(["open_paren"]);
        i++;
      } else if (char === ")") {
        tokens.push(["close_paren"]);
        i++;
      } else if (char === ",") {
        tokens.push(["comma"]);
        i++;
      } else if (/[0-9]/.test(char)) {
        let number = "";

        while (i < formula.length && /[0-9]/.test(formula[i])) {
          number += formula[i];
          i++;
        }

        if (i < formula.length && formula[i] === ".") {
          number += ".";
          i++;

          while (i < formula.length && /[0-9]/.test(formula[i])) {
            number += formula[i];
            i++;
          }
        }

        if (i < formula.length && /[eE]/.test(formula[i])) {
          number += formula[i];
          i++;

          if (i < formula.length && /[+-]/.test(formula[i])) {
            number += formula[i];
            i++;
          }

          while (i < formula.length && /[0-9]/.test(formula[i])) {
            number += formula[i];
            i++;
          }
        }

        tokens.push(["number", parseFloat(number)]);
      } else if (char === "?") {
        i++;
        let identifier = "";
        while (i < formula.length && /[a-zA-Z0-9]/.test(formula[i])) {
          identifier += formula[i];
          i++;
        }

        tokens.push(["formula_reference", identifier]);
      } else if (char === "$") {
        i++;
        let number = "";
        while (i < formula.length && /[0-9]/.test(formula[i])) {
          number += formula[i];
          i++;
        }
        tokens.push(["modifier_reference", number]);
      } else if (/[a-zA-Z]/.test(char)) {
        let identifier = "";
        while (i < formula.length && /[a-zA-Z0-9]/.test(formula[i])) {
          identifier += formula[i];
          i++;
        }
        tokens.push(["identifier", identifier]);
      } else {
        throw new Error(`Unexpected character: ${char}`);
      }
    }
    return tokens;
  }

  private parseAdditiveExpression(tokens: Token[], currentToken: number): [number, number] {
    let left: number;
    [left, currentToken] = this.parseMultiplicativeExpression(tokens, currentToken);

    while (
      currentToken < tokens.length &&
      tokens[currentToken][0] === "binary_op" &&
      ["+", "-"].includes(tokens[currentToken][1] as string)
    ) {
      const operator = tokens[currentToken][1] as string;
      currentToken++;
      const [right, nextToken] = this.parseMultiplicativeExpression(tokens, currentToken);
      currentToken = nextToken;

      if (operator === "+") {
        left += right;
      } else if (operator === "-") {
        left -= right;
      }
    }

    return [left, currentToken];
  }

  private parseMultiplicativeExpression(tokens: Token[], currentToken: number): [number, number] {
    let left: number;
    [left, currentToken] = this.parseUnaryExpression(tokens, currentToken);

    while (
      currentToken < tokens.length &&
      tokens[currentToken][0] === "binary_op" &&
      ["*", "/"].includes(tokens[currentToken][1] as string)
    ) {
      const operator = tokens[currentToken][1] as string;
      currentToken++;
      const [right, nextToken] = this.parseUnaryExpression(tokens, currentToken);
      currentToken = nextToken;

      if (operator === "*") {
        left *= right;
      } else if (operator === "/") {
        left /= right;
      }
    }

    return [left, currentToken];
  }

  private parseUnaryExpression(tokens: Token[], currentToken: number): [number, number] {
    if (currentToken < tokens.length && tokens[currentToken][0] === "binary_op" && tokens[currentToken][1] === "-") {
      currentToken++;
      const [result, nextCurrentToken] = this.parseBasicExpression(tokens, currentToken);
      return [-result, nextCurrentToken];
    } else {
      return this.parseBasicExpression(tokens, currentToken);
    }
  }

  private parseBasicExpression(tokens: Token[], currentToken: number): [number, number] {
    const token = tokens[currentToken];

    currentToken++;

    switch (token[0]) {
      case "number":
        return [token[1] as number, currentToken];
      case "identifier": {
        if (currentToken < tokens.length && tokens[currentToken][0] === "open_paren") {
          const functionName = token[1] as string;
          if (["abs", "sqrt", "sin", "cos", "tan", "atan"].includes(functionName)) {
            return this.parseUnaryFunction(functionName, tokens, currentToken);
          } else if (["min", "max", "atan2"].includes(functionName)) {
            return this.parseBinaryFunction(functionName, tokens, currentToken);
          } else if (functionName === "if") {
            return this.parseTernaryFunction(functionName, tokens, currentToken);
          } else {
            return [this.resolveIdentifier(functionName), currentToken];
          }
        } else {
          return [this.resolveIdentifier(token[1] as string), currentToken];
        }
      }
      case "formula_reference": {
        const formulaName = token[1] as string;
        const formula = this.getFormulas()[formulaName];
        if (!formula) {
          throw new Error(`Formula not found: ${formulaName}`);
        }

        const result = this.evaluateFormula(formula);
        return [result, currentToken];
      }
      case "modifier_reference": {
        const index = parseInt(token[1] as string, 10);
        const modifiers = this.getDrawModifiers();
        return [modifiers[index] || 0, currentToken];
      }
      case "open_paren": {
        const [result, nextCurrentToken] = this.parseAdditiveExpression(tokens, currentToken);
        const finalToken = this.expect(tokens, nextCurrentToken, "close_paren");
        return [result, finalToken];
      }
      default:
        throw new Error(`Unexpected token: ${token[0]}`);
    }
  }

  private parseUnaryFunction(functionName: string, tokens: Token[], currentToken: number): [number, number] {
    currentToken = this.expect(tokens, currentToken, "open_paren");
    const [arg, nextCurrentToken] = this.parseAdditiveExpression(tokens, currentToken);
    const finalToken = this.expect(tokens, nextCurrentToken, "close_paren");

    let result: number;
    switch (functionName) {
      case "abs":
        result = Math.abs(arg);
        break;
      case "sqrt":
        result = Math.sqrt(arg);
        break;
      case "sin":
        result = Math.sin(arg);
        break;
      case "cos":
        result = Math.cos(arg);
        break;
      case "tan":
        result = Math.tan(arg);
        break;
      case "atan":
        result = Math.atan(arg);
        break;
      default:
        throw new Error(`Unknown unary function: ${functionName}`);
    }

    return [result, finalToken];
  }

  private parseBinaryFunction(functionName: string, tokens: Token[], currentToken: number): [number, number] {
    currentToken = this.expect(tokens, currentToken, "open_paren");
    const [arg1, token1] = this.parseAdditiveExpression(tokens, currentToken);
    const token2 = this.expect(tokens, token1, "comma");
    const [arg2, token3] = this.parseAdditiveExpression(tokens, token2);
    const finalToken = this.expect(tokens, token3, "close_paren");

    let result: number;
    switch (functionName) {
      case "min":
        result = Math.min(arg1, arg2);
        break;
      case "max":
        result = Math.max(arg1, arg2);
        break;
      case "atan2":
        result = Math.atan2(arg1, arg2);
        break;
      default:
        throw new Error(`Unknown binary function: ${functionName}`);
    }

    return [result, finalToken];
  }

  private parseTernaryFunction(functionName: string, tokens: Token[], currentToken: number): [number, number] {
    currentToken = this.expect(tokens, currentToken, "open_paren");
    const [condition, token1] = this.parseAdditiveExpression(tokens, currentToken);
    const token2 = this.expect(tokens, token1, "comma");
    const [trueValue, token3] = this.parseAdditiveExpression(tokens, token2);
    const token4 = this.expect(tokens, token3, "comma");
    const [falseValue, token5] = this.parseAdditiveExpression(tokens, token4);
    const finalToken = this.expect(tokens, token5, "close_paren");

    let result: number;
    switch (functionName) {
      case "if":
        result = condition > 0 ? trueValue : falseValue;
        break;
      default:
        throw new Error(`Unknown ternary function: ${functionName}`);
    }

    return [result, finalToken];
  }

  private resolveIdentifier(identifier: string): number {
    switch (identifier) {
      case "left":
        return this.viewBox[0];
      case "top":
        return this.viewBox[1];
      case "right":
        return this.viewBox[2] - this.viewBox[0];
      case "bottom":
        return this.viewBox[3] - this.viewBox[1];
      case "width":
        return this.viewBox[2];
      case "height":
        return this.viewBox[3];
      case "logwidth":
        return this.extractCmValue(this.element.context("parentWidth") as string) * 1000;
      case "logheight":
        return this.extractCmValue(this.element.context("parentHeight") as string) * 1000;
      case "xstretch":
        return parseFloat(this.element.attr("draw:path-stretchpoint-x") || "0");
      case "ystretch":
        return parseFloat(this.element.attr("draw:path-stretchpoint-y") || "0");
      case "hasstroke":
        return 0; // TODO: check if the shape has a stroke
      case "hasfill":
        return 0; // TODO: check if the shape has a fill
      case "pi":
        return Math.PI;
      default:
        throw new Error(`Unknown identifier: ${identifier}`);
    }
  }

  private expect(tokens: Token[], currentToken: number, expected: string): number {
    if (currentToken >= tokens.length || tokens[currentToken][0] !== expected) {
      const actual = currentToken >= tokens.length ? "EOF" : tokens[currentToken][0];
      throw new Error(`Expected '${expected}', got '${actual}'`);
    }
    return currentToken + 1;
  }

  private extractCmValue(value: string | number): number {
    if (typeof value === "string") {
      if (!value.endsWith("cm")) {
        throw new Error(`Invalid unit format: expected 'cm' but got '${value}'`);
      }
      return parseFloat(value);
    }
    return value;
  }

  private getFormulas = memoize((): Record<string, string> => {
    const formulas: Record<string, string> = {};
    const traverseChildren = (element: ParsedElement) => {
      for (const child of element) {
        if (child instanceof Equation) {
          const name = child.attr("draw:name");
          const formula = child.attr("draw:formula");
          if (name && formula) {
            formulas[name] = formula;
          }
        } else {
          traverseChildren(child);
        }
      }
    };

    traverseChildren(this.element);
    return formulas;
  });

  private get viewBox(): [number, number, number, number] {
    return this.element.context("viewBox") || [0, 0, 1, 1];
  }

  private getDrawModifiers(): number[] {
    const modifiersAttr = this.element.attr("draw:modifiers");
    if (!modifiersAttr) {
      return [];
    }
    return modifiersAttr.split(" ").map(Number);
  }

  private getNumParamsForCommand(command: string): number {
    const paramCounts: Record<string, number> = {
      A: 8,
      B: 8,
      C: 6,
      F: 0,
      G: 4,
      L: 2,
      M: 2,
      N: 0,
      Q: 4,
      S: 0,
      T: 6,
      U: 6,
      V: 8,
      W: 8,
      X: 2,
      Y: 2,
      Z: 0,
    };
    return paramCounts[command] || 0;
  }
}

# frozen_string_literal: true

# Parses the `draw:enhanced-path` attribute in an OpenDocument presentation
# The language, as defined in https://docs.oasis-open.org/office/OpenDocument/v1.4/OpenDocument-v1.4-part3-schema.html#attribute-draw_enhanced-path,
# with some editorialization for the purposes of easier reading:
#
#   formula ::=
#     additive_expression
#
#   additive_expression ::=
#     multiplicative_expression
#     ( ( S* '+' S* multiplicative_expression )
#     | ( S* '-' S* multiplicative_expression ) )*
#
#   multiplicative_expression ::=
#     unary_expression  ( ( S* '*' S* unary_expression )
#     | ( S* '/' S* unary_expression ) )*
#
#   unary_expression ::=
#     '-' S* basic_expression
#     | basic_expression
#
#   basic_expression ::=
#     number
#     | identifier
#     | function_reference
#     | modifier_reference
#     | unary_function S* '(' S* additive_expression S* ')'
#     | binary_function S* '(' S* additive_expression S* ',' S* additive_expression S* ')'
#     | ternary_function S* '(' S* additive_expression S* ',' S* additive_expression S* ',' S* additive_expression S* ')'
#     | '(' S* additive_expression S* ')'
#
#   identifier ::= 'pi' | 'left' | 'top' | 'right' | 'bottom' | 'xstretch'
#    | 'ystretch' | 'hasstroke' | 'hasfill' | 'width' | 'height' | 'logwidth'
#    | 'logheight'
#   unary_function ::= 'abs' | 'sqrt' | 'sin' | 'cos' | 'tan' | 'atan'
#   binary_function ::= 'min' | 'max' | 'atan2'
#   ternary_function ::= 'if'
#   number ::= sign? integer | sign? floating-point
#   function_reference ::= "?" name
#   modifier_reference ::= "$" integer
#   floating-point ::= fractional exponent? | integer exponent
#   fractional ::= integer? '.' integer | integer '.'
#   exponent ::= ( 'e' | 'E' ) sign? integer
#   sign ::= '+' | '-'
#   name ::= [^#x20#x9]+
#   integer ::= [0-9]+
#   S ::= (#x20 | #x9)

module ToMdx
  module Parsers
    module Mixins
      OPEN_DOCUMENT_PATH_COMMANDS = %w[A B C F G L M N Q S T U V W X Y Z]

      module HasFormula
        def svg_path
          enhanced_path = @element.attributes["draw:enhanced-path"]
          return nil unless enhanced_path

          enhanced_path_parts = enhanced_path.split(/[,\s]+/)
          path = []
          num_params = 0
          while enhanced_path_parts.length > 0
            # Peek at the token.
            # If it's a command we'll maintain the number of params, so that we can handle many instances of those params.
            # Otherwise we reset everything for the new command.
            token = enhanced_path_parts[0]
            if OPEN_DOCUMENT_PATH_COMMANDS.include?(token)
              enhanced_path_parts.shift
              num_params = num_params_for_command(token)
              path << token
            end

            (1..num_params).each do |i|
              path << parse_parameter(enhanced_path_parts.shift)
            end
          end

          path.join(" ")
        end

        private

        def parse_parameter(parameter)
          value = if parameter.start_with?("?")
            formula_name = parameter[1..]
            formula = formulas[formula_name]
            raise "Formula not found: #{formula_name}" unless formula

            @formula_cache ||= {}
            @formula_cache[formula_name] ||= evaluate_formula(formula)
          elsif parameter.start_with?("$")
            draw_modifiers[parameter[1..].to_i]
          else
            parameter
          end

          value.to_f.round(2).to_s.gsub(/\.0*\Z/, "")
        end

        def evaluate_formula(formula)
          tokens = tokenize(formula)
          current_token = 0
          result, _ = parse_additive_expression(tokens, current_token)
          result
        end

        def parse_additive_expression(tokens, current_token)
          left, current_token = parse_multiplicative_expression(tokens, current_token)

          while current_token < tokens.length && tokens[current_token][0] == :binary_op && ["+", "-"].include?(tokens[current_token][1])
            operator = tokens[current_token][1]
            current_token += 1
            right, current_token = parse_multiplicative_expression(tokens, current_token)

            case operator
            when "+"
              left += right
            when "-"
              left -= right
            end
          end

          [left, current_token]
        end

        def parse_multiplicative_expression(tokens, current_token)
          left, current_token = parse_unary_expression(tokens, current_token)

          while current_token < tokens.length && tokens[current_token][0] == :binary_op && ["*", "/"].include?(tokens[current_token][1])
            operator = tokens[current_token][1]
            current_token += 1
            right, current_token = parse_unary_expression(tokens, current_token)

            case operator
            when "*"
              left *= right
            when "/"
              left /= right
            end
          end

          [left, current_token]
        end

        def parse_unary_expression(tokens, current_token)
          if current_token < tokens.length && tokens[current_token][0] == :binary_op && tokens[current_token][1] == "-"
            current_token += 1
            result, current_token = parse_basic_expression(tokens, current_token)
            [-result, current_token]
          else
            parse_basic_expression(tokens, current_token)
          end
        end

        def parse_basic_expression(tokens, current_token)
          token = tokens[current_token]
          current_token += 1

          case token[0]
          when :number
            [token[1], current_token]
          when :identifier
            # Check if this is a function call (next token is open_paren)
            if current_token < tokens.length && tokens[current_token][0] == :open_paren
              function_name = token[1]
              case function_name
              when "abs", "sqrt", "sin", "cos", "tan", "atan"
                parse_unary_function(function_name, tokens, current_token)
              when "min", "max", "atan2"
                parse_binary_function(function_name, tokens, current_token)
              when "if"
                parse_ternary_function(function_name, tokens, current_token)
              else
                [resolve_identifier(function_name), current_token]
              end
            else
              [resolve_identifier(token[1]), current_token]
            end
          when :formula_reference
            result = evaluate_formula(formulas[token[1]])
            [result, current_token]
          when :modifier_reference
            [draw_modifiers[token[1].to_i], current_token]
          when :open_paren
            result, current_token = parse_additive_expression(tokens, current_token)
            current_token = expect(tokens, current_token, :close_paren)
            [result, current_token]
          else
            raise "Unexpected token: #{token}"
          end
        end

        def parse_unary_function(function_name, tokens, current_token)
          current_token = expect(tokens, current_token, :open_paren)
          arg, current_token = parse_additive_expression(tokens, current_token)
          current_token = expect(tokens, current_token, :close_paren)

          case function_name
          when "abs"
            [arg.abs, current_token]
          when "sqrt"
            [Math.sqrt(arg), current_token]
          when "sin"
            [Math.sin(arg), current_token]
          when "cos"
            [Math.cos(arg), current_token]
          when "tan"
            [Math.tan(arg), current_token]
          when "atan"
            [Math.atan(arg), current_token]
          else
            raise "Unknown unary function: #{function_name}"
          end
        end

        def parse_binary_function(function_name, tokens, current_token)
          current_token = expect(tokens, current_token, :open_paren)
          arg1, current_token = parse_additive_expression(tokens, current_token)
          current_token = expect(tokens, current_token, :comma)
          arg2, current_token = parse_additive_expression(tokens, current_token)
          current_token = expect(tokens, current_token, :close_paren)

          case function_name
          when "min"
            [[arg1, arg2].min, current_token]
          when "max"
            [[arg1, arg2].max, current_token]
          when "atan2"
            [Math.atan2(arg1, arg2), current_token]
          else
            raise "Unknown binary function: #{function_name}"
          end
        end

        def parse_ternary_function(function_name, tokens, current_token)
          current_token = expect(tokens, current_token, :open_paren)
          condition, current_token = parse_additive_expression(tokens, current_token)
          current_token = expect(tokens, current_token, :comma)
          true_value, current_token = parse_additive_expression(tokens, current_token)
          current_token = expect(tokens, current_token, :comma)
          false_value, current_token = parse_additive_expression(tokens, current_token)
          current_token = expect(tokens, current_token, :close_paren)

          case function_name
          when "if"
            [condition > 0 ? true_value : false_value, current_token]
          else
            raise "Unknown ternary function: #{function_name}"
          end
        end

        def resolve_identifier(identifier)
          case identifier
          when "left"
            view_box[0]
          when "top"
            view_box[1]
          when "right"
            view_box[2] - view_box[0]
          when "bottom"
            view_box[3] - view_box[1]
          when "width"
            view_box[2]
          when "height"
            view_box[3]
          when "logwidth"
            extract_cm_value(svg_width) * 1000
          when "logheight"
            extract_cm_value(svg_height) * 1000
          when "xstretch"
            @element.attributes["draw:path-stretchpoint-x"].to_f
          when "ystretch"
            @element.attributes["draw:path-stretchpoint-y"].to_f
          when "hasstroke"
            0  # TODO check if the shape has a stroke
          when "hasfill"
            0  # TODO check if the shape has a fill
          when "pi"
            Math::PI
          else
            raise "Unknown identifier: #{identifier}"
          end
        end

        def svg_width
          @element.parent.attributes["svg:width"]
        end

        def svg_height
          @element.parent.attributes["svg:height"]
        end

        def expect(tokens, current_token, expected)
          if current_token >= tokens.length || tokens[current_token][0] != expected
            raise "Expected '#{expected}', got '#{tokens[current_token][0]}'"
          end
          current_token + 1
        end

        def tokenize(formula)
          tokens = []
          i = 0
          while i < formula.length
            char = formula[i]
            case char
            when /\s/
              i += 1
            when /[+\-*\/]/
              tokens << [:binary_op, char]
              i += 1
            when "("
              tokens << [:open_paren]
              i += 1
            when ")"
              tokens << [:close_paren]
              i += 1
            when ","
              tokens << [:comma]
              i += 1
            when /[0-9]/
              number = ""

              # Handle the integral part of the number
              while i < formula.length && formula[i] =~ /[0-9]/
                number += formula[i]
                i += 1
              end

              # Handle the fractional part of the number
              if i < formula.length && formula[i] == "."
                number += "."
                i += 1

                while i < formula.length && formula[i] =~ /[0-9]/
                  number += formula[i]
                  i += 1
                end
              end

              # Handle the exponent part of the number
              if i < formula.length && formula[i] =~ /[eE]/
                number += formula[i]
                i += 1

                if i < formula.length && formula[i] =~ /[+\-]/
                  number += formula[i]
                  i += 1
                end

                while i < formula.length && formula[i] =~ /[0-9]/
                  number += formula[i]
                  i += 1
                end
              end

              tokens << [:number, number.to_f]
            when "?"
              i += 1
              identifier = ""
              while i < formula.length && formula[i] =~ /[a-zA-Z0-9]/
                identifier += formula[i]
                i += 1
              end
              tokens << [:formula_reference, identifier]
              i += 1
            when "$"
              i += 1
              number = ""
              while i < formula.length && formula[i] =~ /[0-9]/
                number += formula[i]
                i += 1
              end
              tokens << [:modifier_reference, number]
              i += 1
            when /[a-zA-Z]/
              identifier = ""
              while i < formula.length && formula[i] =~ /[a-zA-Z0-9]/
                identifier += formula[i]
                i += 1
              end
              tokens << [:identifier, identifier]
            else
              raise "Unexpected character: #{char}"
            end
          end
          tokens
        end

        def num_params_for_command(command)
          case command
          when "A"
            8
          when "B"
            8
          when "C"
            6
          when "F"
            0
          when "G"
            4
          when "L"
            2
          when "M"
            2
          when "N"
            0
          when "Q"
            4
          when "S"
            0
          when "T"
            6
          when "U"
            6
          when "V"
            8
          when "W"
            8
          when "X"
            2
          when "Y"
            2
          when "Z"
            0
          else
            raise "Unknown command: #{command}"
          end
        end

        def extract_cm_value(value)
          if value.is_a?(String)
            raise "Invalid unit format: expected 'cm' but got '#{value}'" unless value.end_with?("cm")
            value.to_f
          else
            value
          end
        end

        def formulas
          @formulas_hash ||= begin
            hash = {}
            @element.elements.each do |element|
              if element.expanded_name == "draw:equation"
                name = element.attributes["draw:name"]
                formula = element.attributes["draw:formula"]
                hash[name] = formula if name && formula
              end
            end
            hash
          end
        end

        def draw_modifiers
          @draw_modifiers ||= @element.attributes["draw:modifiers"].split(" ").map(&:to_i)
        end
      end
    end
  end
end
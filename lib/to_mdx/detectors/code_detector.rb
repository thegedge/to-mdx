# frozen_string_literal: true

require_relative "./language_detector"
require_relative "../parsers/open_document/base"

module ToMdx
  module Detectors
    module CodeDetector
      # If this element looks like a code snippet, return the MDX for it
      def maybe_code_snippet_mdx
        return nil unless @context[:options][:use_heuristics]
        return nil unless is_using_monospace_font?

        text_content = to_s.chomp
        language = ToMdx::Detectors::LanguageDetector.detect(text_content)

        "\n```#{language}\n#{text_content}\n```\n"
      end

      def is_using_monospace_font?
        return false unless @element.respond_to?(:children)
        return false unless @context[:styles]

        @element.children.any? do |child|
          if child.attributes["text:style-name"]
            style_properties = @context[:styles].properties(child.attributes["text:style-name"])
            font_name = style_properties["font-family"]
            next true if font_name&.include?("monospace")
          end

          child.children.any? do |grandchild|
            if grandchild.attributes["text:style-name"]
              style_properties = @context[:styles].properties(grandchild.attributes["text:style-name"])
              font_name = style_properties["font-family"]
              font_name&.include?("monospace")
            end
          end
        end
      end
    end
  end
end
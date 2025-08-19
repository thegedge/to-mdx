# frozen_string_literal: true

require_relative "../base"
require_relative "../../../detectors/code_detector"

module ToMdx
  module Parsers
    module Text
      class TextBox < Base
        include ToMdx::Detectors::CodeDetector

        attr_reader :text_style_name

        def initialize(element = nil, context = {})
          super(element, context)
          @text_style_name = context[:styles].use(element&.attributes&.[]("draw:text-style-name"))
        end

        def to_mdx
          code_snippet = maybe_code_snippet_mdx
          return code_snippet if code_snippet

          content = contentful_children.map(&:to_mdx).join(" ")
          if @text_style_name.empty?
            content
          else
            "<span className=\"#{@text_style_name}\">#{content}</span>"
          end
        end

        def to_s
          contentful_children.map(&:to_s).join
        end

        def with_context(context)
          context.merge(
            parent_is_code_snippet: is_using_monospace_font?
          )
        end

        register_for "draw:text-box"
      end
    end
  end
end
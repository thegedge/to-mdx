# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Text
      class Span < Base
        attr_reader :style_name

        def initialize(element = nil, context = {})
          super(element, context)
          @style_name = context[:styles]&.use(element&.attributes&.[]("text:style-name")) || ""
        end

        def to_mdx
          content = contentful_children.map(&:to_mdx).join
          if @style_name.empty?
            content
          else
            "<span className=\"#{@style_name}\">#{content}</span>"
          end
        end

        def to_s
          content = contentful_children.map(&:to_s).join
          if context[:parent_is_code_snippet] && is_plaintext? && has_background?
            "___#{content}___"
          else
            content
          end
        end

        def is_plaintext?
          single_child? { |child| child.is_a?(Parsers::Text::PlainText) }
        end

        def has_background?
          return false unless @context[:styles]
          style_properties = @context[:styles].properties(element&.attributes&.[]("text:style-name"))
          !!style_properties["background-color"]
        end

        register_for "text:span"
      end
    end
  end
end
# frozen_string_literal: true

require_relative "../base"
require_relative "../mixins/parent_traversal"
require_relative "./span"

module ToMdx
  module Parsers
    module Text
      class Paragraph < Base
        attr_reader :presentation_class, :style_name

        def initialize(element = nil, context = {})
          super(element, context)

          frame = Mixins::ParentTraversal.find_parent_frame(element)
          @presentation_class = frame&.attributes&.[]("presentation:class")
          @style_name = context[:styles].use(element&.attributes&.[]("text:style-name"))
        end

        def empty?
          false
        end

        def to_mdx
          return "" if merged_children.all?(&:empty?)

          case @presentation_class
          when "title", "subtitle"
            to_s
          else
            text = merged_children.map(&:to_mdx).join
            if @style_name.empty?
              text
            else
              <<~MDX
                <p className="#{@style_name}">
                  #{text}
                </p>
              MDX
            end
          end
        end

        def to_s
          return "\n" if merged_children.all?(&:empty?)

          text = merged_children.map(&:to_s).join
          child_content = case @presentation_class
          when "title"
            "# #{text.strip.gsub(/\s+/, " ")}"
          when "subtitle"
            "## #{text.strip.gsub(/\s+/, " ")}"
          else
            text
          end

          "#{child_content}\n"
        end

        private

        def merged_children
          @merged_children ||= contentful_children.reduce([]) do |acc, child|
            previous_child = acc.last
            if spans_can_be_merged?(previous_child, child)
              previous_child.children[0].text += child.children[0].text
            else
              acc << child
            end

            acc
          end
        end

        def spans_can_be_merged?(a, b)
          a.is_a?(Parsers::Text::Span) &&
            b.is_a?(Parsers::Text::Span) &&
            a.is_plaintext? &&
            b.is_plaintext? &&
            a.style_name == b.style_name
        end

        register_for "text:p"
      end
    end
  end
end
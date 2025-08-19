# frozen_string_literal: true

require_relative "../base"
require_relative "../mixins/parent_traversal"

module ToMdx
  module Parsers
    module Table
      class TableCell < Base
        def initialize(element = nil, context = {})
          super(element, context)

          parent_row = Mixins::ParentTraversal.find_parent(element, "table:table-row")
          @style = context[:styles].use(element&.attributes&.[]("table:style-name"))
          @default_style = context[:styles].use(parent_row&.attributes&.[]("table:default-cell-style-name"))
        end

        def to_mdx
          effective_style = @style.empty? ? @default_style : @style
          style_class = effective_style.empty? ? "" : " className=\"#{effective_style}\""
          "<td#{style_class}>#{children.map(&:to_mdx).join(" ")}</td>"
        end

        def to_s
          children.map(&:to_s).join(" | ")
        end

        register_for "table:table-cell"
      end
    end
  end
end
# frozen_string_literal: true

require_relative "../base"
require_relative "table_cell"

module ToMdx
  module Parsers
    module Table
      class TableRow < Base
        def initialize(element = nil, context = {})
          super(element, context)
          @style_name = context[:styles].use(element&.attributes&.[]("table:style-name"))
        end

        def to_mdx
          content = children.map(&:to_mdx).join
          style_class = @style_name.empty? ? "" : " className=\"#{@style_name}\""
          "<tr#{style_class}>#{content}</tr>"
        end

        def to_s
          children.map(&:to_s).join(" | ")
        end

        register_for "table:table-row"
      end
    end
  end
end
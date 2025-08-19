# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Table
      class Table < Base
        def initialize(element = nil, context = {})
          super(element, context)
          @style_name = context[:styles].use(element&.attributes&.[]("table:style-name"))
        end

        def to_mdx
          content = children.map(&:to_mdx)
          style_class = " className=\"w-full h-full#{@style_name.empty? ? "" : " #{@style_name}"}\""
          "<table#{style_class}>#{content.join}</table>"
        end

        def to_s
          children.map(&:to_s).join("\n")
        end

        register_for "table:table"
      end
    end
  end
end
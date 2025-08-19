# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Text
      class List < Base
        attr_accessor :style_name

        def initialize(element = nil, context = {})
          super(element, context)
          @style_name = context[:styles].use(element&.attributes&.[]("text:style-name"))
        end

        def to_mdx
          style_class = @style_name.empty? ? "" : " className=\"#{@style_name}\""
          <<~MDX
            <ul#{style_class}>
              #{contentful_children.map(&:to_mdx).join}
            </ul>
          MDX
        end

        def to_s
          contentful_children.map(&:to_s).join("\n")
        end

        register_for "text:list"
      end
    end
  end
end
# frozen_string_literal: true

require_relative "../base"
require_relative "../mixins/positionable_element"

module ToMdx
  module Parsers
    module Draw
      class Group < Base
        include Mixins::PositionableElement

        def initialize(element = nil, context = {})
          super(element, context)
          @draw_style_name = context[:styles].use(element&.attributes&.[]("draw:style-name"))
        end

        def to_mdx
          draw_style_class = @draw_style_name.empty? ? "" : " className=\"#{@draw_style_name}\""
          <<~MDX
            <div#{draw_style_class} data-name="#{@element.attributes["draw:name"]}">
              #{contentful_children.map(&:to_mdx).compact.join}
            </div>
          MDX
        end

        def to_s
          contentful_children.map(&:to_s).compact.join
        end

        register_for "draw:g"
      end
    end
  end
end
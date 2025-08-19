# frozen_string_literal: true

require_relative "../base"
require_relative "../mixins/has_formula"
require_relative "../mixins/positionable_element"
require_relative "../mixins/svg"

module ToMdx
  module Parsers
    module Draw
      class EnhancedGeometry < Base
        include Mixins::HasFormula
        include Mixins::PositionableElement
        include Mixins::Svg

        def initialize(element = nil, context = {})
          super(element, context)
          @draw_style_name = context[:styles].use(element&.attributes&.[]("draw:style-name"))
        end

        def empty?
          false
        end

        def to_mdx
          # TODO if it's just a rectangle that fills the entire parent text area / custom shape, just style the custom shape instead
          return "" if @element.attributes["draw:type"] == "ooxml-rect"
          wrap_with_svg_tag("<path d=\"#{svg_path}\" />", @draw_style_name)
        end

        def to_s
          # Enhanced geometry elements don't contribute text content
          ""
        end

        register_for "draw:enhanced-geometry"
      end
    end
  end
end
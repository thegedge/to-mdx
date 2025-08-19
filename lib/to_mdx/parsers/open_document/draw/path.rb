# frozen_string_literal: true

require_relative "../base"

require_relative "../../../detectors/code_detector"
require_relative "../mixins/positionable_element"
require_relative "../mixins/svg"
require_relative "../mixins/has_formula"

module ToMdx
  module Parsers
    module Draw
      class Path < Base
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
          wrap_with_svg_tag("<path d=\"#{svg_path}\" />", @draw_style_name)
        end

        def to_s
          contentful_children.map(&:to_s).compact.join
        end

        register_for "draw:path"
      end
    end
  end
end
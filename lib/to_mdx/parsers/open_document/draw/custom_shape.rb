# frozen_string_literal: true

require_relative "../base.rb"
require_relative "../../../detectors/code_detector"
require_relative "../mixins/positionable_element"
require_relative "../mixins/svg"

module ToMdx
  module Parsers
    module Draw
      class CustomShape < Base
        include ToMdx::Detectors::CodeDetector
        include Mixins::PositionableElement
        include Mixins::Svg

        def initialize(element = nil, context = {})
          super(element, context)
          @draw_style_name = context[:styles].use(element&.attributes&.[]("draw:style-name"))
        end

        def to_mdx
          class_attr = @draw_style_name.empty? ? "" : " className=\"#{@draw_style_name}\""

          code_snippet = maybe_code_snippet_mdx
          return "<div#{class_attr} style={#{generate_combined_style_object}}>#{code_snippet}</div>" if code_snippet

          <<-MDX
            <div#{class_attr} style={#{generate_combined_style_object}}>
              #{contentful_children.map(&:to_mdx).compact.join}
            </div>
          MDX
        end

        def to_s
          contentful_children.map(&:to_s).compact.join
        end

        def with_context(context)
          context.merge(
            parent_style_name: @draw_style_name,
            parent_width: @width,
            parent_height: @height,
            parent_is_code_snippet: is_using_monospace_font?
          )
        end

        register_for "draw:custom-shape"
      end
    end
  end
end
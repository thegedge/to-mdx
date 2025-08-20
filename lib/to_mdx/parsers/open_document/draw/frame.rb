# frozen_string_literal: true

require_relative "../base"
require_relative "../mixins/positionable_element"

module ToMdx
  module Parsers
    module Draw
      class Frame < Base
        include Mixins::PositionableElement

        def initialize(element = nil, context = {})
          super(element, context)
          @presentation_class = element&.attributes&.[]("presentation:class")
          @presentation_style_name = context[:styles].use(element&.attributes&.[]("presentation:style-name"))
          @draw_text_style_name = context[:styles].use(element&.attributes&.[]("draw:text-style-name"))
        end

        def to_mdx
          content = contentful_children.map(&:to_mdx).join("\n")
          if needs_positioning?
            style_object = generate_positioning_style_object
            class_names = [@presentation_style_name.to_s, @draw_text_style_name.to_s].compact.join(" ")
            class_attr = class_names.empty? ? "" : " className=\"#{class_names}\""

            <<~MDX
              <div#{class_attr} style={#{style_object.to_json}}>
                #{content}
              </div>
            MDX
          else
            content
          end
        end

        def to_s
          contentful_children.map(&:to_s).join
        end

        def is_mostly_centered?
          sibling_frames = element.parent.children.select { |child| child.is_a?(REXML::Element) && child.expanded_name != "presentation:notes" }
          return false if sibling_frames.length > 1

          positioning_style = generate_positioning_style_object
          center_x = positioning_style[:left].to_f + 0.5*positioning_style[:width].to_f
          center_y = positioning_style[:top].to_f + 0.5*positioning_style[:height].to_f
          center_x > 45.0 && center_x < 65.0 && center_y > 45.0 && center_y < 65.0
        end

        def needs_positioning?
          has_positioning? && !is_title_or_subtitle? && !is_mostly_centered?
        end

        def is_title_or_subtitle?
          @presentation_class == "title" || @presentation_class == "subtitle"
        end

        def layout_class
          if @context[:options][:use_heuristics]
            return "blank" if needs_positioning?
            return "centered" if is_mostly_centered?
          end
          @presentation_class
        end

        register_for "draw:frame"
      end
    end
  end
end
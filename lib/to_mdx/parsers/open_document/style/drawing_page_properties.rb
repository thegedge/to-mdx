# frozen_string_literal: true

require_relative "../base"
require_relative "./fill_image"

module ToMdx
  module Parsers
    module Style
      class DrawingPageProperties < Base
        def initialize(element = nil, context = {})
          super(element, context)
        end

        def to_css
          css_properties = {}

          @element.attributes.each do |name, value|
            case name
            when "draw:fill-color"
              css_properties["background-color"] = value
            when "draw:fill"
              if value == "bitmap"
                css_properties["background-repeat"] = "no-repeat"
                css_properties["background-size"] = "cover"
              end
            when "draw:fill-image-name"
              props = Style::FillImage.fill_image(value)&.to_css
              css_properties.merge!(props) if props
            end
          end

          css_properties
        end

        register_for "style:drawing-page-properties"
      end
    end
  end
end
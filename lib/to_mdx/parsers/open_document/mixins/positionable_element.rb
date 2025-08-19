# frozen_string_literal: true

module ToMdx
  module Parsers
    module Mixins
      module PositionableElement
        def x
          element&.attributes&.[]("svg:x")
        end

        def y
          element&.attributes&.[]("svg:y")
        end

        def width
          element&.attributes&.[]("svg:width")
        end

        def height
          element&.attributes&.[]("svg:height")
        end

        def has_positioning?
          !!(x || y || width || height)
        end

        def generate_positioning_style_object
          return {} unless has_positioning?

          page_dimensions = @context[:page_dimensions]
          if page_dimensions
            page_width_cm = page_dimensions[:width]
            page_height_cm = page_dimensions[:height]
          else
            raise "Page dimensions not found"
          end

          x_percent = convert_cm_to_percent(x, page_width_cm)
          y_percent = convert_cm_to_percent(y, page_height_cm)
          width_percent = convert_cm_to_percent(width, page_width_cm)
          height_percent = convert_cm_to_percent(height, page_height_cm)

          {
            position: "absolute",
            left: x_percent,
            top: y_percent,
            width: width_percent,
            height: height_percent,
            zIndex: 1
          }.compact
        end

        def convert_cm_to_percent(value, page_dimension)
          return nil unless value

          match = value.match(/^(-?[\d.]+)cm$/)
          raise "Invalid unit format: expected 'cm' but got '#{value}'" unless match

          cm_value = match[1].to_f
          percent = (cm_value / page_dimension * 100).round(1)
          "#{percent}%"
        end
      end
    end
  end
end
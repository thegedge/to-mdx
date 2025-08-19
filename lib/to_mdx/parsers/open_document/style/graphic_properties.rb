# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Style
      class GraphicProperties < Base
        def initialize(element = nil, context = {})
          super(element, context)
        end

        def to_css
          return {} unless @element&.attributes

          css_properties = {}
          style_family = @context[:style_family] || ""

          @element.attributes.each do |name, value|
            case name
            when "draw:fill-color"
              if style_family == "graphic"
                css_properties["fill"] = value
              else
                css_properties["background-color"] = value
              end
            when "draw:fill"
              css_properties["background-repeat"] = value == "bitmap" ? "no-repeat" : nil
            when "draw:opacity"
              if style_family == "graphic"
                css_properties["fill-opacity"] = value
              else
                css_properties["opacity"] = value
              end
            when "draw:shadow"
              if value == "visible"
                shadow_offset_x = @element.attributes["draw:shadow-offset-x"] || "0cm"
                shadow_offset_y = @element.attributes["draw:shadow-offset-y"] || "0cm"
                shadow_color = @element.attributes["draw:shadow-color"] || "#000000"
                shadow_opacity = @element.attributes["draw:shadow-opacity"] || "100%"

                offset_x_px = (shadow_offset_x.to_f * 37.8).round
                offset_y_px = (shadow_offset_y.to_f * 37.8).round
                opacity_decimal = shadow_opacity.to_f / 100

                shadow_color_with_opacity = shadow_color.gsub(/#([0-9a-fA-F]{6})/) do |match|
                  hex = $1
                  r = hex[0..1].to_i(16)
                  g = hex[2..3].to_i(16)
                  b = hex[4..5].to_i(16)
                  "rgba(#{r}, #{g}, #{b}, #{opacity_decimal})"
                end

                css_properties["text-shadow"] = "#{offset_x_px}px #{offset_y_px}px #{shadow_color_with_opacity}"
              end
            when "draw:stroke"
              # TODO: Handle this
            when "draw:textarea-vertical-align"
              unless style_family.start_with?("table")
                css_properties["display"] = "flex"
                css_properties["flex-direction"] = "column"
                css_properties["justify-content"] = case value
                  when "top"
                    nil # default, no need to set a value
                  when "middle"
                    "center"
                  when "bottom"
                    "end"
                end
              end
            when "svg:stroke-color"
              if style_family == "graphic"
                css_properties["stroke"] = value
              else
                css_properties["border-color"] = value
              end
            when "svg:stroke-width"
              value = value.to_f * 1000 if value.is_a?(String) && value.end_with?("cm")
              unless value.to_f.zero?
                if style_family == "graphic"
                  css_properties["stroke-width"] = value
                else
                  css_properties["border-width"] = value
                end
              end
            when "fo:padding-top"
              css_properties["padding-top"] = convert_cm_to_percentage(value, @context[:page_dimensions][:height])
            when "fo:padding-bottom"
              css_properties["padding-bottom"] = convert_cm_to_percentage(value, @context[:page_dimensions][:height])
            when "fo:padding-left"
              css_properties["padding-left"] = convert_cm_to_percentage(value, @context[:page_dimensions][:width])
            when "fo:padding-right"
              css_properties["padding-right"] = convert_cm_to_percentage(value, @context[:page_dimensions][:width])
            end
          end

          css_properties
        end

        def convert_cm_to_percentage(cm_value, page_dimension)
          return nil unless cm_value
          percentage = (cm_value.to_f * 100 / page_dimension).round(2)
          "#{percentage}%"
        end

        register_for "style:graphic-properties"
        register_for "loext:graphic-properties"
      end
    end
  end
end
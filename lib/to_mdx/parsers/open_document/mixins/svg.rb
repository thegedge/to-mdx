# frozen_string_literal: true

module ToMdx
  module Parsers
    module Mixins
      module Svg
        def wrap_with_svg_tag(content, classname = nil)
          attributes = []
          attributes << "className=\"#{classname}\"" unless classname&.empty?
          attributes << "xmlns=\"http://www.w3.org/2000/svg\""
          attributes << "style={#{generate_combined_style_object.to_json}}"

          # I don't know why, but I needed to multiple by 1.2, otherwise I saw some cropping in some SVG.
          # Would be nice to figure out why this worked, and what's wrong with our computation.
          x, y, w, h = view_box
          attributes << "viewBox=\"0 0 #{w * 1.2} #{h * 1.2}\""

          "<svg #{attributes.join(" ")}>#{content}</svg>"
        end

        def view_box
          @view_box ||= begin
            view_box_attr = @element.attributes["svg:viewBox"]
            return view_box_attr.split(" ").map(&:to_f) if view_box_attr && view_box_attr != "0 0 0 0"
            return text_areas if text_areas

            parent_width = @context[:parent_width]
            parent_height = @context[:parent_height]
            return [0, 0, parent_width, parent_height] if parent_width && parent_height

            [0, 0, 1, 1] # default to the unit square
          end
        end

        def text_areas
          @text_areas ||= begin
            text_areas_attr = @element.attributes["draw:text-areas"]
            if text_areas_attr && text_areas_attr != "0 0 0 0"
              text_areas_attr.split(" ").map { |v| evaluate_formula(v) }
            else
              nil
            end
          end
        end

        private

        def generate_combined_style_object
          styles = {}
          styles.merge!(generate_positioning_style_object)
          styles.merge!(generate_transform_styles)

          styles[:position] = 'absolute'
          styles[:top] ||= convert_cm_to_percentage(y, @context[:page_dimensions][:height])
          styles[:left] ||= convert_cm_to_percentage(x, @context[:page_dimensions][:width])
          styles[:width] ||= convert_cm_to_percentage(width, @context[:page_dimensions][:width]) || "100%"
          styles[:height] ||= convert_cm_to_percentage(height, @context[:page_dimensions][:height]) || "100%"
          styles[:zIndex] = 1
          styles.compact
        end

        def generate_transform_styles
          return {} unless draw_transform

          styles = {}

          # CSS evaluates transforms right-to-left, but OpenDocument spec says left-to-right, hence the reverse
          transforms = draw_transform.scan(/(\w+)\s*\(([^)]+)\)/).reverse.map do |function, params|
            case function.downcase
            when "skewx"
              angle = params.strip.to_f
              if angle < 1e-2
                nil
              else
                "skewX(#{angle}rad)"
              end
            when "skewy"
              angle = params.strip.to_f
              if angle < 1e-2
                nil
              else
                "skewY(#{angle}rad)"
              end
            when "rotate"
              angle = params.strip.to_f
              if angle < 1e-2
                nil
              else
                "rotate(-#{angle}rad)"
              end
            when "translate"
              x, y = params.strip.split(/\s+/)
              x_percentage = convert_cm_to_percentage(x, @context[:page_dimensions][:width])
              y_percentage = convert_cm_to_percentage(y, @context[:page_dimensions][:height])
              styles[:left] = x_percentage
              styles[:top] = y_percentage if y_percentage
              nil
            when "scale"
              coords = params.strip.split(/\s+/)
              if coords.length >= 1
                x_scale = coords[0].to_f
                y_scale = coords[1] ? coords[1].to_f : x_scale
                "scale(#{x_scale}, #{y_scale})"
              end
            end
          end.compact

          unless transforms.empty?
            styles[:transform] = transforms.compact.join(" ")
            styles[:transformOrigin] = "top left"
          end

          styles
        end

        def convert_cm_to_percentage(cm_value, page_dimension)
          return nil unless cm_value
          percentage = (cm_value.to_f * 100 / page_dimension).round(2)
          "#{percentage}%"
        end

        def draw_transform
          @element.attributes["draw:transform"]
        end
      end
    end
  end
end
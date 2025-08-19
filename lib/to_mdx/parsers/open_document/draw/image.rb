# frozen_string_literal: true

require_relative "../base"
require_relative "../mixins/parent_traversal"

module ToMdx
  module Parsers
    module Draw
      class Image < Base
        attr_accessor :href, :alt_text, :image_path

        def initialize(element = nil, context = {})
          super(element, context)

          @href = element&.attributes&.[]("href")
          @alt_text = element&.text&.strip || "image"
          @image_path = if empty?
            nil
          else
            "/img/presentations/#{@context[:basename]}/#{@href.sub(%r{^Pictures/}, "")}"
          end
        end

        def empty?
          !@href || @href.empty? || @href.end_with?(".svm")
        end

        def should_fill?
          @should_fill = if empty?
            false
          else
            parent_frame = Mixins::ParentTraversal.find_parent_frame(@element)
            if parent_frame
              width_cm = parent_frame.attributes["svg:width"]
              height_cm = parent_frame.attributes["svg:height"]
              width_cm && height_cm
            else
              false
            end
          end
        end

        def to_mdx
          if should_fill?
            <<~MDX
              <Image
                alt="#{@alt_text}"
                src="#{@image_path}"
                className="w-full h-full object-contain"
              />
            MDX
          else
            to_s
          end
        end

        def to_s
          "![#{@alt_text}](#{@image_path})"
        end

        private

        # Standard page dimensions in cm (same as FrameElement)
        PAGE_WIDTH_CM = 25.4
        PAGE_HEIGHT_CM = 14.288

        def self.get_page_dimensions(frame_element)
          # Use hardcoded page dimensions instead of calculating from frames
          { width: PAGE_WIDTH_CM, height: PAGE_HEIGHT_CM }
        end

        def self.convert_cm_to_percent(value, page_dimension)
          match = value.match(/^(-?[\d.]+)cm$/)
          raise "Invalid unit format: expected 'cm' but got '#{value}'" unless match
          cm_value = match[1].to_f
          (cm_value / page_dimension * 100).round(1)
        end

        register_for "draw:image"
      end
    end
  end
end
# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Style
      class Marker < Base
        attr_reader :marker_name, :view_box, :path_data

        def initialize(element = nil, context = {})
          super(element, context)
          @marker_name = element&.attributes&.[]("draw:name")
          @view_box = element&.attributes&.[]("svg:viewBox")
          @path_data = element&.attributes&.[]("svg:d")
        end

        def to_css
          return {} unless @marker_name

          properties = extract_properties
          return {} if properties.empty?

          css_properties = generate_marker_properties(properties)
          css_properties.any? ? { @marker_name => css_properties } : {}
        end

        def extract_properties
          return {} unless @element&.attributes

          @element.attributes.each_with_object({}) do |(name, value), props|
            props[name] = value
          end
        end

        private

        def generate_marker_properties(properties)
          css_properties = {}

          properties.each do |name, value|
            case name
            when "svg:viewBox"
              css_properties["viewBox"] = value
            when "svg:d"
              css_properties["d"] = value
            end
          end

          css_properties
        end

        register_for "draw:marker"
      end
    end
  end
end
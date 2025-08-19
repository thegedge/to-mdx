# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Style
      class TextProperties < Base
        def initialize(element = nil, context = {})
          super(element, context)
        end

        def to_css
          return {} unless @element&.attributes

          css_properties = {}

          @element.attributes.each do |name, value|
            case name
            when "fo:background-color"
              css_properties["background-color"] = value
            when "fo:color"
              css_properties["color"] = value
            when "fo:font-size"
              value = "#{value.to_f.round}pt" if value.end_with?("pt")
              css_properties["font-size"] = value # TODO based on the default style, adjust this (default = 1rem)
            when "fo:font-weight"
              css_properties["font-weight"] = value unless value == "normal"
            when "fo:font-style"
              css_properties["font-style"] = value unless value == "normal"
            when "style:text-line-through-type"
              css_properties["text-decoration"] = case value
              when "single", "double"
                "line-through"
              else
                nil
              end
            when "style:text-line-through-style"
              css_properties["text-decoration-style"] = case value
              when "solid"
                "solid"
              when "dotted", "dot-dash", "dot-dot-dash"
                "dotted"
              when "dashed", "long-dash"
                "dashed"
              when "wave"
                "wavy"
              else
                nil
              end
            when "style:text-line-through-width"
              css_properties["text-decoration-thickness"] = value
            when "style:font-name"
              css_properties["font-family"] = case value
              when /Mono/
                "'Courier New', Courier, monospace"
              when /Serif/
                "Georgia, 'Times New Roman', Times, serif"
              else
                nil # Assume sans / default
              end

              css_properties["font-weight"] = case value
              when "Bold"
                "bold"
              when "Light"
                "light"
              else
                nil
              end

              css_properties["font-style"] = "italic" if value.include?("Italic")
            when "fo:letter-spacing"
              css_properties["letter-spacing"] = value unless value == "normal"
            end
          end

          css_properties
        end

        register_for "style:text-properties"
      end
    end
  end
end
# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Style
      class ParagraphProperties < Base
        def initialize(element = nil, context = {})
          super(element, context)
        end

        def to_css
          return {} unless @element&.attributes

          css_properties = {}
          @element.attributes.each do |name, value|
            case name
            when "fo:border"
              css_properties["border"] = value
            when "fo:line-height"
              css_properties["line-height"] = value.end_with?("%") ? (value.to_f / 100).to_s : value
            when "fo:margin-bottom"
              css_properties["margin-bottom"] = value unless value.to_f.zero?
            when "fo:margin-left"
              css_properties["margin-left"] = value unless value.to_f.zero?
            when "fo:margin-right"
              css_properties["margin-right"] = value unless value.to_f.zero?
            when "fo:margin-top"
              css_properties["margin-top"] = value unless value.to_f.zero?
            when "fo:text-align"
              css_properties["text-align"] = value unless value == "start"
            when "fo:text-indent"
              css_properties["text-indent"] = value unless value.to_f.zero?
            when "style:writing-mode"
              css_properties["writing-mode"] = value unless value == "lr-tb"
            end
          end

          css_properties
        end

        register_for "style:paragraph-properties"
      end
    end
  end
end
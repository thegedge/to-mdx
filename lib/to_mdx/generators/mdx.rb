# frozen_string_literal: true

require "date"
require "yaml"
require_relative "../parsers/open_document/base"

module ToMdx
  module Generators
    class Mdx
      def self.generate_frontmatter(metadata)
        frontmatter = {
          "title" => "",
          "subtitle" => "",
          "description" => "",
          "company" => {
            "name" => "",
            "position" => ""
          },
          "event" => {
            "name" => "",
            "url" => ""
          },
          "keywords" => []
        }

        metadata.each do |name, value|
          next if name == "date"
          if value.is_a?(String) && value.include?("\\n")
            frontmatter[name] = value.split("\\n").map(&:strip).join("\n")
          else
            frontmatter[name] = value
          end
        end

        "#{frontmatter.to_yaml}---\n"
      end

      def self.generate_slide_content(slide_content, styles)
        # The slide content is now already formatted as MDX by the parsers
        slide_content
      end

      def self.format_attributes(attributes)
        return "" if attributes.nil? || attributes.empty?

        formatted_attrs = []

        attributes.each do |key, value|
          case value
          when String
            formatted_attrs << "#{key}=\"#{value}\""
          when Array
            formatted_attrs << "#{key}={[#{value.join(", ")}]}"
          end
        end

        " #{formatted_attrs.join(" ")}"
      end
    end
  end
end
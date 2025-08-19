# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Meta
      class UserDefined < Base
        attr_reader :property_name, :property_value

        def initialize(element = nil, context = {})
          super(element, context)
          @property_name = element&.attributes&.[]("meta:name")
          @property_value = process_property_value(element&.text&.strip)
        end

        def to_mdx
          ""
        end

        def to_s
          return "" unless property_name && property_value
          "#{property_name}: #{property_value}"
        end

        private

        def process_property_value(value)
          return nil unless property_name
          return nil unless value && !value.empty?

          underscored_name = property_name.downcase.gsub(/[^a-z0-9_]+/, " ").gsub(/\s+/, "_")

          case underscored_name
          when "keywords", "tags"
            value = value.split(", ").map(&:strip)
            unless value.empty?
              context["keywords"] ||= []
              context["keywords"] << value
            end
            value
          when /^(event|company)_(.+)$/
            namespace, property_name = $1, $2
            context[namespace] ||= {}
            context[namespace][property_name] = value
            context[namespace]
          when "date", "presentation_date"
            presentation_date = value.is_a?(Date) ? value : Date.parse(value)
            context["date"] = presentation_date
            presentation_date
          else
            context[underscored_name] = value
            value
          end
        end

        register_for "meta:user-defined"
      end
    end
  end
end

# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Style
      class MasterPage < Base
        attr_reader :master_page_name

        def initialize(element = nil, context = {})
          super(element, context)
          @master_page_name = element&.attributes&.[]("style:name")
        end

        def to_mdx
          background_objects = contentful_children.select do |child|
            layer_attr = child.element&.attributes&.[]("draw:layer")
            layer_attr == "backgroundobjects"
          end

          background_objects.map(&:to_mdx).compact.join("\n")
        end

        def to_s
          contentful_children.map(&:to_s).join("\n")
        end

        register_for "style:master-page"
      end
    end
  end
end
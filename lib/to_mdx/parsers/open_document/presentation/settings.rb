# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Presentation
      class PresentationSettings < Base
        attr_accessor :mouse_visible

        def initialize(element = nil, context = {})
          super(element, context)
          @mouse_visible = element&.attributes&.[]("presentation:mouse-visible")
        end

        def empty?
          true
        end

        def to_mdx
          ""
        end

        def to_s
          ""
        end

        register_for "presentation:settings"
      end
    end
  end
end
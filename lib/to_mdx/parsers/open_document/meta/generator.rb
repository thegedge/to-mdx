# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Meta
      class Generator < Base
        attr_reader :generator_text

        def initialize(element = nil, context = {})
          super(element, context)
          @generator_text = element&.text&.strip

          unless @generator_text&.empty?
            context["generator"] = @generator_text
          end
        end

        def to_mdx
          ""
        end

        def to_s
          generator_text || ""
        end

        register_for "meta:generator"
      end
    end
  end
end

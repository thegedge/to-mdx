# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Meta
      class EditingCycles < Base
        attr_reader :cycles_text

        def initialize(element = nil, context = {})
          super(element, context)
          @cycles_text = element&.text&.strip

          unless @cycles_text&.empty?
            context["editing_cycles"] = @cycles_text
          end
        end

        def to_mdx
          ""
        end

        def to_s
          cycles_text || ""
        end

        register_for "meta:editing-cycles"
      end
    end
  end
end

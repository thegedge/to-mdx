# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module DublinCore
      class Description < Base
        attr_reader :description_text

        def initialize(element = nil, context = {})
          super(element, context)
          @description_text = element&.text&.strip

          if @description_text && !@description_text.empty?
            truncated = @description_text.length > 80 ? "#{@description_text[0..77]}..." : @description_text
            puts("🔍 Found presentation description: #{truncated}")

            context["description"] = @description_text
          end
        end

        def to_mdx
          ""
        end

        def to_s
          description_text || ""
        end

        register_for "dc:description"
      end
    end
  end
end

# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Meta
      class Keyword < Base
        attr_reader :keyword_text

        def initialize(element = nil, context = {})
          super(element, context)
          @keyword_text = element&.text&.strip

          unless @keyword_text&.empty?
            context["keywords"] ||= []
            context["keywords"] << @keyword_text
          end
        end

        def to_mdx
          ""
        end

        def to_s
          keyword_text || ""
        end

        register_for "meta:keyword"
      end
    end
  end
end

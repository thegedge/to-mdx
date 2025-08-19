# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module DublinCore
      class Title < Base
        attr_reader :title_text

        def initialize(element = nil, context = {})
          super(element, context)
          @title_text = element&.text&.strip
          context["title"] = @title_text unless @title_text&.empty?
        end

        def to_mdx
          ""
        end

        def to_s
          title_text || ""
        end

        register_for "dc:title"
      end
    end
  end
end

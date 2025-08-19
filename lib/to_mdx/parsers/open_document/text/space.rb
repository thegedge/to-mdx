# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Text
      class Space < Base
        def initialize(element = nil, context = {})
          super(element, context)
          count = element&.attributes&.[]("text:c")&.to_i || 1
          @text = " " * count
        end

        def empty?
          false
        end

        def to_mdx
          @text
        end

        def to_s
          @text
        end

        register_for "text:s"
      end
    end
  end
end
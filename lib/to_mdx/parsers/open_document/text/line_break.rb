# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Text
      class LineBreak < Base
        def initialize(element = nil, context = {})
          super(element, context)
        end

        def empty?
          false
        end

        def to_mdx
          "<br />"
        end

        def to_s
          "\n"
        end

        register_for "text:line-break"
      end
    end
  end
end
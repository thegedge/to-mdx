# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Office
      class Styles < Base
        def initialize(element = nil, context = {})
          super(element, context)
        end

        def to_css
          children.map(&:to_css).reduce({}, :merge)
        end

        register_for "office:styles"
      end
    end
  end
end
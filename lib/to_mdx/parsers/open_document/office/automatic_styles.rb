# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Office
      class AutomaticStyles < Base
        def initialize(element = nil, context = {})
          super(element, context)

          # TODO if colliding keys, merge the hash values instead of clobbering the key
          context[:styles]&.merge!(to_css)
        end

        def empty?
          false
        end

        def to_mdx
          context[:styles].to_mdx
        end

        def to_css
          children.map(&:to_css).reduce({}, :merge)
        end

        register_for "office:automatic-styles"
      end
    end
  end
end
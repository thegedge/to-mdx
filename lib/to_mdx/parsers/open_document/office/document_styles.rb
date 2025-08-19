# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Office
      class DocumentStyles < Base
        def to_css
          children.map(&:to_css).reduce({}, :merge)
        end

        register_for "office:document-styles"
      end
    end
  end
end
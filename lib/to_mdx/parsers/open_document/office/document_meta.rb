# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Office
      class DocumentMeta < Base
        def initialize(element = nil, context = {})
          super(element, context)
        end

        def to_mdx
          ""
        end

        def to_s
          ""
        end

        def with_context(context)
          # The office:meta child will merge its data into the context
          # We just pass through the context from our children
          context
        end

        register_for "office:document-meta"
      end
    end
  end
end

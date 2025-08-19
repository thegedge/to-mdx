# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Office
      class DocumentContent < Base
        attr_reader :styles, :body

        def initialize(element = nil, context = {})
          super(element, context)
          @styles = children.find { |child| child.is_a?(Office::AutomaticStyles) }
          @body = children.find { |child| child.is_a?(Office::Body) }
        end

        def to_mdx
          <<~MDX
            #{styles.to_mdx}
            #{body.to_mdx}
          MDX
        end

        def to_s
          body.to_s
        end

        register_for "office:document-content"
      end
    end
  end
end
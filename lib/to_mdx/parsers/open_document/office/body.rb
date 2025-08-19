# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Office
      class Body < Base
        def to_mdx
          contentful_children.map(&:to_mdx).join
        end

        def to_s
          contentful_children.map(&:to_s).join
        end

        register_for "office:body"
      end
    end
  end
end
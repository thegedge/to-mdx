# frozen_string_literal: true

require_relative "../base"
require_relative "./automatic_styles"

module ToMdx
  module Parsers
    module Office
      class Presentation < Base
        def to_mdx
          <<~MDX
            <Slides>
            #{contentful_children.map(&:to_mdx).join("\n")}
            </Slides>
          MDX
        end

        def to_s
          contentful_children.map(&:to_s).join
        end

        register_for "office:presentation"
      end
    end
  end
end
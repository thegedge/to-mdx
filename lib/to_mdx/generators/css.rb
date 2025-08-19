# frozen_string_literal: true

module ToMdx
  module Generators
    class Css
      def self.generate(styles_parser, basename = nil)
        return "" unless styles_parser

        styles_parser.to_mdx
      end
    end
  end
end
# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Text
      class PlainText < Base
        attr_accessor :text

        def initialize(text_node)
          super(text_node)
          @text = decode_html_entities(text_node.to_s)
        end

        def empty?
          @text.empty?
        end

        def to_mdx
          Base.escape_for_mdx(@text)
        end

        def to_s
          @text
        end

        private

        def decode_html_entities(text)
          text.gsub(/&quot;/, '"')
               .gsub(/&lt;/, '<')
               .gsub(/&gt;/, '>')
               .gsub(/&amp;/, '&')
        end
      end
    end
  end
end
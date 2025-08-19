# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Text
      class ListItem < Base
        def to_mdx
          "<li>#{contentful_children.map(&:to_mdx).join}</li>"
        end

        def to_s
          "- #{contentful_children.map(&:to_s).map(&:chomp).join(" ")}"
        end

        register_for "text:list-item"
      end
    end
  end
end
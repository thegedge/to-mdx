# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Text
      class Link < Base
        attr_reader :href, :style_name

        def initialize(element = nil, context = {})
          super(element, context)
          @href = element&.attributes&.[]("xlink:href")
          @style_name = context[:styles].use(element&.attributes&.[]("text:style-name"))
        end

        def empty?
          !@href || @href.empty?
        end

        def to_mdx
          alt_text = contentful_children.map(&:to_mdx).join
          if @style_name.empty?
            "<a href=\"#{@href}\">#{alt_text}</a>"
          else
            "<a href=\"#{@href}\" className=\"#{@style_name}\">#{alt_text}</a>"
          end
        end

        def to_s
          alt_text = contentful_children.map(&:to_s).join
          "[#{alt_text}](#{@href})"
        end

        register_for "text:a"
      end
    end
  end
end
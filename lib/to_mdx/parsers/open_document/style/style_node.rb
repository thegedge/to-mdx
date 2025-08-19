# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Style
      class StyleNode < Base
        attr_reader :style_name, :parent_style_name, :display_name

        def initialize(element = nil, context = {})
          super(element, context)
          @style_name = element&.attributes&.[]("style:name")
          @parent_style_name = element&.attributes&.[]("style:parent-style-name")
          @display_name = element&.attributes&.[]("style:display-name")
        end

        def to_css
          return {} unless @style_name
          { @style_name => children.map(&:to_css).reduce({}, :merge) }
        end

        def with_context(context)
          context.merge(
            style_family: element&.attributes&.[]("style:family"),
          )
        end

        register_for "style:style"
        register_for "style:default-style"
      end
    end
  end
end
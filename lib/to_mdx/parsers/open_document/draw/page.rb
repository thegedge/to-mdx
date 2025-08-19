# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Draw
      class Page < Base
        attr_reader :page_class, :master_page_name

        def initialize(element = nil, context = {})
          super(element, context)
          @page_class = element&.attributes&.[]("presentation:class")
          @style_name = context[:styles].use(element&.attributes&.[]("draw:style-name"))
        end

        def to_mdx
          class_parts = [layout_class || master_page_class, @page_class]
          class_parts << @style_name unless @style_name.empty?
          class_name = class_parts.compact.uniq.join(" ")
          slide_tag = class_name.empty? ? "<Slide>" : "<Slide className=\"#{class_name}\">"

          <<~MDX
            #{slide_tag}
              #{contentful_children.map(&:to_mdx).join("\n  ")}
            </Slide>
          MDX
        end

        def to_s
          contentful_children.map(&:to_s).join("\n")
        end

        private

        def layout_class
          if single_child? { |el| el.respond_to?(:layout_class) }
            contentful_children.first.layout_class
          else
            nil
          end
        end

        def master_page_class
          case element&.attributes&.[]("draw:master-page-name")&.downcase
          when "caption_5f_only"
            "caption"
          when "title"
            "title"
          when "title_5f_only"
            "title-with-points"
          else
            nil
          end
        end

        register_for "draw:page"
      end
    end
  end
end
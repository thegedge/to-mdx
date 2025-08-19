# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Style
      class FillImage < Base
        class << self
          def fill_images
            @fill_images ||= {}
          end

          def fill_image(name)
            fill_images[name]
          end
        end

        def initialize(element = nil, context = {})
          super(element, context)
          @href = element&.attributes&.[]("xlink:href")
          @name = element&.attributes&.[]("draw:name")
          self.class.fill_images[@name] = self if @name
        end

        def empty?
          @href.empty?
        end

        def to_css
          return {} if empty?

          basename = @context[:basename]
          href = "/img/presentations/#{basename}/#{@href.sub(%r{^Pictures/}, "")}"

          {
            "background-image" => "url('#{href}')",
            "background-repeat" => "no-repeat",
            "background-size" => "cover"
          }
        end

        register_for "draw:fill-image"
      end
    end
  end
end
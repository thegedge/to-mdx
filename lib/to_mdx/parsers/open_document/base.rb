# frozen_string_literal: true

require "rexml/document"
require "rexml/xpath"

module ToMdx
  module Parsers
    class Base
      @@registered_parsers = {}

      class << self
        def register_for(*element_names)
          element_names.each do |element_name|
            @@registered_parsers[element_name] = self
          end
        end

        def parse_xml(content)
          REXML::Document.new(content)
        end

        def escape_for_mdx(text)
          text.gsub(/{/, '\{')
        end

        def parse(element, context)
          parser_class = @@registered_parsers[element.expanded_name]
          parser_class ? parser_class.new(element, context) : nil
        end
      end

      attr_reader :element, :context, :children

      def initialize(element = nil, context = {})
        @element = element
        @context = context
        @context = self.with_context(context)
        @children = !@element.respond_to?(:children) ? [] : @element.children.map do |child|
          case child
          when REXML::Element
            self.class.parse(child, @context)
          when REXML::Text
            Text::PlainText.new(child)
          else
            raise "Unknown child type: #{child.class}"
          end
        end.compact
      end

      def to_mdx
        raise NotImplementedError, "#{self.class} must implement to_mdx"
      end

      def to_s
        raise NotImplementedError, "#{self.class} must implement to_s"
      end

      def with_context(context)
        context
      end

      def contentful_children
        children.reject(&:empty?)
      end

      def empty?
        contentful_children.empty?
      end

      def single_child?(&block)
        children = contentful_children.reject { |child| child.is_a?(Presentation::Notes) }
        return false unless children.length == 1
        block_given? ? block.call(children.first) : true
      end
    end
  end
end
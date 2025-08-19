# frozen_string_literal: true

module ToMdx
  module Parsers
    module Mixins
      module ParentTraversal
        def self.find_parent(element, element_name)
          current = element.parent
          while current
            return current if current.expanded_name == element_name
            current = current.parent
          end
          nil
        end

        def self.find_parent_frame(element)
          find_parent(element, "draw:frame")
        end

        def self.find_parent_page(element)
          find_parent(element, "draw:page")
        end
      end
    end
  end
end
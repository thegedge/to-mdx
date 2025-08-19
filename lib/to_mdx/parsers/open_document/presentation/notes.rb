# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Presentation
      class Notes < Base
        def to_mdx
          # We use to_s here because I have a preference for speaker to be plain text
          <<~MDX
            <SpeakerNotes>
              #{to_s}
            </SpeakerNotes>
          MDX
        end

        def to_s
          contentful_children.map(&:to_s).join("\n")
        end

        register_for "presentation:notes"
      end
    end
  end
end
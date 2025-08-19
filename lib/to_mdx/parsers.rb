# frozen_string_literal: true

require_relative "./parsers/open_document"

module ToMdx
  module Parsers
    def self.parse(file_path, context)
      if file_path.end_with?(".odp")
        OpenDocument.parse(file_path, context)
      else
        raise "Unknown file type: #{file_path}"
      end
    end
  end
end
# frozen_string_literal: true

require_relative "../base"

module ToMdx
  module Parsers
    module Office
      class Meta < Base
        register_for "office:meta"
      end
    end
  end
end

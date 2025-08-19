# frozen_string_literal: true

module ToMdx
  module Detectors
    class LanguageDetector
      LANGUAGE_PATTERNS = {
        ruby: [
          /\b(def|class|module|puts|gets)\b/,
          /\b:\w+\b/,  # symbols
          /\battr_(reader|writer|accessor)\s+:\w+/,
          /\b(elsif|unless|ensure|rescue|yield|end|rescue_from)\b/,
          /\bdo($|\s+\|)/,
          /\.new\b/,
          /\brender:\b/,
          /\b\w+\([^)]+\w+:/     # keyword arguments
        ],
      }.freeze

      MIN_SCORE = 2

      def self.detect(content)
        content_lower = content.downcase
        best_language = nil
        best_score = 0

        LANGUAGE_PATTERNS.each do |language, patterns|
          score = patterns.sum { |pattern| content_lower.scan(pattern).length }

          if score >= MIN_SCORE && score > best_score
            best_language = language.to_s
            best_score = score
          end
        end

        best_language || "plaintext"
      end
    end
  end
end
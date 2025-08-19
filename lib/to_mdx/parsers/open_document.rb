# frozen_string_literal: true

require "zip"
require "fileutils"
require "date"
require "tmpdir"
require "optparse"

require_relative "./open_document/base"
require_relative "./open_document/all_parsers"
require_relative "../styles"
require_relative "../generators/mdx"
require_relative "../page_dimensions"

module ToMdx
  module Parsers
    module OpenDocument
      class << self
        def parse(output_root, presentation_file, options = {})
          Zip::File.open(presentation_file) do |zip_file|
            content_doc = nil
            meta_doc = nil
            styles_doc = nil

            zip_file.each do |entry|
              case entry.name
              when "content.xml"
                content_doc = ToMdx::Parsers::Base.parse_xml(entry.get_input_stream.read)
              when "meta.xml"
                meta_doc = ToMdx::Parsers::Base.parse_xml(entry.get_input_stream.read)
              when "styles.xml"
                styles_doc = ToMdx::Parsers::Base.parse_xml(entry.get_input_stream.read)
              end
            end

            unless content_doc && meta_doc && styles_doc
              raise Error("Error: Could not find content.xml or meta.xml in the presentation file.")
            end

            page_dimensions = ToMdx::PageDimensions.infer(content_doc, styles_doc)
            if page_dimensions
              puts("🔍 Found page dimensions: #{page_dimensions[:width]}cm x #{page_dimensions[:height]}cm")
            end

            # Create empty styles to avoid circular dependency issues
            styles = ToMdx::Styles.new({})

            metadata = {}
            parsed_meta_doc = ToMdx::Parsers::Base.parse(meta_doc.root, metadata)

            title = get_presentation_title(metadata)
            subtitle = metadata["subtitle"]
            description = metadata["description"]
            date = get_presentation_date(metadata)
            basename = "#{date.strftime('%Y-%m-%d')}_#{sanitize_filename(title)}"

            context = {
              metadata: metadata,
              basename: basename,
              options: options,
              page_dimensions: page_dimensions,
              styles: styles,
            }

            extract_images(zip_file, basename, output_root)

            frontmatter = ToMdx::Generators::Mdx.generate_frontmatter(metadata)
            content = ToMdx::Parsers::Base.parse(content_doc.root, context)

            relative_output_file = File.join("src/pages/presentations", generate_filename(date, title))
            output_file = File.join(output_root, relative_output_file)
            FileUtils.mkdir_p(File.dirname(output_file))

            File.open(output_file, "w") do |f|
              f.write(frontmatter)
              f.write("\n")
              f.write(content.to_mdx)
              f.write("\n")
            end

            puts("")
            puts("✅ #{relative_output_file}")
          end
        end

        private

        def get_presentation_title(metadata)
          title = metadata["title"]
          if title && !title.empty?
            puts("🔍 Found presentation title: #{title}")
            return title
          end

          print("Enter presentation title: ")
          $stdout.flush
          STDIN.gets.chomp
        end

        def get_presentation_date(metadata)
          date = metadata["date"]
          if date
            puts("🔍 Found presentation date: #{date}")
            return date
          end

          print("Enter presentation date (YYYY-MM-DD): ")
          $stdout.flush
          date_input = STDIN.gets.chomp

          begin
            Date.parse(date_input)
          rescue Date::Error
            puts("Invalid date format. Please use YYYY-MM-DD.")
            exit(1)
          end
        end

        def sanitize_filename(text)
          text.downcase
              .gsub(/[^a-z0-9\s]/, "")
              .gsub(/\s+/, "_")
        end

        def generate_filename(date, title)
          basename = "#{date.strftime('%Y-%m-%d')}_#{sanitize_filename(title)}"
          "#{basename}.mdx"
        end

        def extract_images(zip_file, basename, project_root)
          images_dir = File.join(project_root, "src", "static", "img", "presentations", basename)
          FileUtils.mkdir_p(images_dir)

          zip_file.each do |entry|
            next unless entry.name.start_with?("Pictures/")

            target_path = File.join(images_dir, entry.name.sub(/^Pictures\//, ""))

            begin
              entry.extract(target_path)
            rescue Zip::DestinationFileExistsError
              # Skip if file already exists
            end
          end
        end
      end
    end
  end
end
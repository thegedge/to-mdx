# frozen_string_literal: true

require_relative "./parsers/open_document/base"

module ToMdx
  module PageDimensions
    class << self
      def infer(content_doc, styles_doc)
        infer_from_master_page(content_doc, styles_doc) ||
          infer_from_page_layout(styles_doc) ||
          largest_page_frame(content_doc)
      end

      private

      def infer_from_master_page(content_doc, styles_doc)
        master_page_counts = {}
        content_doc.elements.each("//draw:page") do |page|
          master_page = page.attributes["draw:master-page-name"]
          if master_page
            master_page_counts[master_page] ||= 0
            master_page_counts[master_page] += 1
          end
        end

        most_common_master_page = master_page_counts.max_by { |_, count| count }&.first
        return nil unless most_common_master_page

        master_page = REXML::XPath.first(styles_doc, "//style:master-page/@style:name[.='#{most_common_master_page}']")&.element
        return nil unless master_page

        page_layout_name = master_page.attributes["style:page-layout-name"]
        return nil unless page_layout_name

        page_layout = REXML::XPath.first(styles_doc, "//style:page-layout/@style:name[.='#{page_layout_name}']")&.element
        return nil unless page_layout

        props = page_layout.elements["style:page-layout-properties"]
        return nil unless props

        width_attr = props.attributes["fo:page-width"]
        height_attr = props.attributes["fo:page-height"]
        return nil unless width_attr && height_attr

        width_cm = extract_cm_value(width_attr)
        height_cm = extract_cm_value(height_attr)
        return { width: width_cm, height: height_cm } if width_cm && height_cm

        nil
      end

      def infer_from_page_layout(styles_doc)
        styles_doc.elements.each("//style:page-layout-properties") do |props|
          width_attr = props.attributes["fo:page-width"]
          height_attr = props.attributes["fo:page-height"]

          next unless width_attr && height_attr

          width_cm = extract_cm_value(width_attr)
          height_cm = extract_cm_value(height_attr)

          next unless width_cm && height_cm

          return { width: width_cm, height: height_cm }
        end

        nil
      end

      def largest_page_frame(content_doc)
        max_width = 0
        max_height = 0

        content_doc.elements.each("//draw:frame") do |frame|
          width_attr = frame.attributes["svg:width"]
          height_attr = frame.attributes["svg:height"]

          next unless width_attr && height_attr

          width_cm = extract_cm_value(width_attr)
          height_cm = extract_cm_value(height_attr)

          next unless width_cm && height_cm

          if width_cm > max_width
            max_width = width_cm
          end

          if height_cm > max_height
            max_height = height_cm
          end
        end

        return nil if max_width == 0 || max_height == 0

        { width: max_width, height: max_height }
      end

      def extract_cm_value(value)
        match = value.match(/^(-?[\d.]+)cm$/)
        return nil unless match

        match[1].to_f
      end
    end
  end
end
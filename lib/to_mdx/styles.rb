module ToMdx
  class Styles
    class << self
      def from_element(element)
        styles = element.to_css if element.respond_to?(:to_css)
        new(styles)
      end
    end

    attr_reader :styles, :used_styles

    def initialize(styles = {})
      @styles = styles
      @used_styles = Set.new
    end

    def merge!(other)
      if other.is_a?(Styles)
        @styles = @styles.merge(other.styles)
        @used_styles = @used_styles.merge(other.used_styles)
      elsif other.is_a?(Hash)
        @styles = @styles.merge(other)
      else
        raise "Styles can't merge with type '#{other.class}'"
      end
    end

    def properties(key)
      if key.is_a?(Style)
        @styles.fetch(key.key, {})
      else
        @styles.fetch(key, {})
      end
    end

    def use(key)
      @used_styles.add(key) if key
      Style.new(key, self)
    end

    def [](key)
      @styles.fetch(key, {})
    end

    def to_mdx
      return "" if optimized_styles.empty?

      classes = property_mapping.map { |property, classname| ".#{classname} { #{property} }" }

      <<~MDX
        <style>{`
          #{classes.join("\n")}
        `}</style>
      MDX
    end

    def optimized_styles
      @optimized_styles ||= begin
        used_styles.reduce({}) do |acc, key|
          acc[key] = []
          styles = @styles[key]
          next acc unless styles

          # Generate a utility class for each property (or use the existing one, if it exists)
          styles.each do |property, value|
            next unless value
            property_key = "#{property}: #{value};"
            property_mapping[property_key] ||= "c#{property_mapping.size}"
            acc[key] << property_mapping[property_key]
          end
          acc
        end
      end
    end

    def property_mapping
      # This hash maps a CSS property to a generated utility class for that property
      @property_mapping ||= {}
    end
  end

  class Style
    attr_reader :key

    def initialize(key, styles)
      @key = key
      @styles = styles
    end

    def empty?
      style = @styles.optimized_styles[@key]
      style ? style.empty? : true
    end

    def to_s
      value = @styles.optimized_styles[@key]
      value ? value.join(" ") : ""
    end
  end
end
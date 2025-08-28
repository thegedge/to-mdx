// Import all parsers to ensure they register themselves

// Base parser
import "./base.ts";

// DC (Dublin Core) parsers
import "./dc/description.ts";
import "./dc/title.ts";

// Meta parsers
import "./meta/keyword.ts";
import "./meta/user_defined.ts";

// Style parsers
import "./style/drawing_page_properties.ts";
import "./style/fill_image.ts";
import "./style/graphic_properties.ts";
import "./style/marker.ts";
import "./style/master_page.ts";
import "./style/paragraph_properties.ts";
import "./style/style_node.ts";
import "./style/table_column_properties.ts";
import "./style/text_properties.ts";

// Table parsers
import "./table/table-cell.ts";
import "./table/table-column.ts";
import "./table/table-row.ts";
import "./table/table.ts";

// Office parsers
import "./office/automatic-styles.ts";
import "./office/body.ts";
import "./office/document_content.ts";
import "./office/document_meta.ts";
import "./office/document_styles.ts";
import "./office/meta.ts";
import "./office/presentation.ts";
import "./office/styles.ts";

// Draw parsers
import "./draw/custom_shape.ts";
import "./draw/enhanced_geometry.ts";
import "./draw/frame.ts";
import "./draw/group.ts";
import "./draw/image.ts";
import "./draw/page.ts";
import "./draw/path.ts";

// Text parsers
import "./text/line_break.ts";
import "./text/link.ts";
import "./text/list.ts";
import "./text/list_item.ts";
import "./text/paragraph.ts";
import "./text/plain_text.ts";
import "./text/space.ts";
import "./text/span.ts";
import "./text/text_box.ts";

// Presentation parsers
import "./presentation/notes.ts";

export {}; // Make this a module

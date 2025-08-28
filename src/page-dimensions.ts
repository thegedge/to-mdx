export interface PageDimensions {
  width: number;
  height: number;
}

export function infer(contentDoc: Document, stylesDoc: Document): PageDimensions | null {
  return inferFromMasterPage(contentDoc, stylesDoc) || inferFromPageLayout(stylesDoc) || largestPageFrame(contentDoc);
}

function inferFromMasterPage(contentDoc: Document, stylesDoc: Document): PageDimensions | null {
  const masterPageCounts: Record<string, number> = {};

  // Find most common master page
  const pages = contentDoc.getElementsByTagName("draw:page");
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i] as Element;
    const masterPage = page.getAttribute("draw:master-page-name");
    if (masterPage) {
      masterPageCounts[masterPage] = (masterPageCounts[masterPage] || 0) + 1;
    }
  }

  const mostCommonMasterPage = Object.entries(masterPageCounts).reduce(
    (max, [name, count]) => (count > max.count ? { name, count } : max),
    { name: "", count: 0 },
  ).name;

  if (!mostCommonMasterPage) return null;

  // Find the master page element
  const masterPages = stylesDoc.getElementsByTagName("style:master-page");
  let masterPageElement: Element | null = null;

  for (let i = 0; i < masterPages.length; i++) {
    const mp = masterPages[i] as Element;
    if (mp.getAttribute("style:name") === mostCommonMasterPage) {
      masterPageElement = mp;
      break;
    }
  }

  if (!masterPageElement) return null;

  const pageLayoutName = masterPageElement.getAttribute("style:page-layout-name");
  if (!pageLayoutName) return null;

  // Find the page layout
  const pageLayouts = stylesDoc.getElementsByTagName("style:page-layout");
  let pageLayout: Element | null = null;

  for (let i = 0; i < pageLayouts.length; i++) {
    const pl = pageLayouts[i] as Element;
    if (pl.getAttribute("style:name") === pageLayoutName) {
      pageLayout = pl;
      break;
    }
  }

  if (!pageLayout) return null;

  const props = pageLayout.getElementsByTagName("style:page-layout-properties")[0];
  if (!props) return null;

  const widthAttr = props.getAttribute("fo:page-width");
  const heightAttr = props.getAttribute("fo:page-height");

  if (!widthAttr || !heightAttr) return null;

  const width = extractCmValue(widthAttr);
  const height = extractCmValue(heightAttr);

  return width !== null && height !== null ? { width, height } : null;
}

function inferFromPageLayout(stylesDoc: Document): PageDimensions | null {
  const pageLayoutProps = stylesDoc.getElementsByTagName("style:page-layout-properties");

  for (let i = 0; i < pageLayoutProps.length; i++) {
    const props = pageLayoutProps[i];
    const widthAttr = props.getAttribute("fo:page-width");
    const heightAttr = props.getAttribute("fo:page-height");

    if (!widthAttr || !heightAttr) continue;

    const width = extractCmValue(widthAttr);
    const height = extractCmValue(heightAttr);

    if (width !== null && height !== null) {
      return { width, height };
    }
  }

  return null;
}

function largestPageFrame(contentDoc: Document): PageDimensions | null {
  let maxWidth = 0;
  let maxHeight = 0;

  const frames = contentDoc.getElementsByTagName("draw:frame");

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const widthAttr = frame.getAttribute("svg:width");
    const heightAttr = frame.getAttribute("svg:height");

    if (!widthAttr || !heightAttr) continue;

    const width = extractCmValue(widthAttr);
    const height = extractCmValue(heightAttr);

    if (width !== null && height !== null) {
      if (width > maxWidth) maxWidth = width;
      if (height > maxHeight) maxHeight = height;
    }
  }

  return maxWidth > 0 && maxHeight > 0 ? { width: maxWidth, height: maxHeight } : null;
}

function extractCmValue(value: string): number | null {
  const match = value.match(/^(-?[\d.]+)cm$/);
  return match ? parseFloat(match[1]) : null;
}

import CartesianPlot from './plots/CartesianPlot';
import MediaFallback from './MediaFallback';
import MediaExpand from './MediaExpand';

const SUPPORTED_MEDIA_VERSIONS = ['1.0'];

/**
 * GraphRenderer — routes by coordinateSystem + plotType.
 * Wraps every graph in MediaExpand for tap-to-expand.
 */
export default function GraphRenderer({ item }) {
  const { graph, version, alt } = item;

  if (!SUPPORTED_MEDIA_VERSIONS.includes(version)) {
    return <MediaFallback alt={alt} label="[unsupported media version]" />;
  }

  if (!graph) {
    return <MediaFallback alt={alt} label="[missing graph data]" />;
  }

  // BC stubs — not yet implemented
  if (graph.plotType === 'parametric' || graph.plotType === 'polar') {
    return <MediaFallback alt={alt} label={`[${graph.plotType} graph not implemented yet]`} />;
  }

  if (graph.coordinateSystem === 'cartesian') {
    return (
      <MediaExpand>
        <CartesianPlot graph={graph} alt={alt} />
      </MediaExpand>
    );
  }

  return <MediaFallback alt={alt} label={`[${graph.coordinateSystem || 'unknown'} coordinate system not supported]`} />;
}

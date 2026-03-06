import MediaFallback from './MediaFallback';

export default function DiagramRenderer({ item }) {
  return <MediaFallback alt={item?.alt} label="[diagram not implemented yet]" />;
}
